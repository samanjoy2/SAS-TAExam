#!/usr/bin/env bash
# Black-box probe of API edge cases against a running backend.
#   bash stress/edge-cases.sh [http://localhost:8080]
# Prints PASS/FAIL per case and exits non-zero if anything fails.
set -u
B="${1:-http://localhost:8080}"
pass=0; fail=0
export PYTHONUTF8=1   # Windows: read piped UTF-8 correctly
# Unique student ids per run so repeated runs do not collide with earlier data.
RUN=$(printf '%06d' $((RANDOM * 32768 + RANDOM)) | tail -c 6)
S1=20179${RUN}000001; S2=20179${RUN}000002; S3=20179${RUN}000003

# expect <name> <expected-status> <curl args...>
expect() {
  local name="$1" want="$2"; shift 2
  local out code body
  out=$(curl -s -w $'\n%{http_code}' "$@")
  code="${out##*$'\n'}"; body="${out%$'\n'*}"
  if [[ "$code" == "$want" ]]; then pass=$((pass+1)); printf 'PASS %-58s %s\n' "$name" "$code"
  else fail=$((fail+1)); printf 'FAIL %-58s want %s got %s  %s\n' "$name" "$want" "$code" "${body:0:160}"; fi
  LAST_BODY="$body"
}
json() { python3 -c "import json,sys;print(json.load(sys.stdin)$1)" 2>/dev/null || python -c "import json,sys;print(json.load(sys.stdin)$1)"; }
J=(-H 'Content-Type: application/json')

echo "== POST /classes validation"
expect "valid class"                                201 -XPOST "$B/classes" "${J[@]}" -d '{"name":"Edge Class","totalSeats":2}'
CID=$(echo "$LAST_BODY" | json "['id']")
# Body goes through a file: on Windows, non-ASCII command-line arguments to curl.exe get mangled.
BN_FILE=$(mktemp); printf '{"name":"%s","totalSeats":3}' 'ষষ্ঠ' > "$BN_FILE"
expect "bengali name"                               201 -XPOST "$B/classes" "${J[@]}" --data-binary @"$BN_FILE"
BID=$(echo "$LAST_BODY" | json "['id']")
[[ $(curl -s "$B/classes/$BID" | json "['name']==chr(0x9b7)+chr(0x9b7)+chr(0x9cd)+chr(0x9a0)") == True ]] \
  && { echo "PASS bengali name round-trips"; pass=$((pass+1)); } || { echo "FAIL bengali name round-trip"; fail=$((fail+1)); }
expect "unknown extra fields ignored"               201 -XPOST "$B/classes" "${J[@]}" -d '{"name":"Extra","totalSeats":1,"foo":true}'
expect "camelCase-insensitive keys"                 201 -XPOST "$B/classes" "${J[@]}" -d '{"Name":"Pascal","TotalSeats":1}'
expect "empty name"                                 400 -XPOST "$B/classes" "${J[@]}" -d '{"name":"","totalSeats":5}'
expect "whitespace name"                            400 -XPOST "$B/classes" "${J[@]}" -d '{"name":"   ","totalSeats":5}'
expect "name 201 chars"                             400 -XPOST "$B/classes" "${J[@]}" -d "{\"name\":\"$(printf 'x%.0s' {1..201})\",\"totalSeats\":5}"
expect "missing totalSeats"                         400 -XPOST "$B/classes" "${J[@]}" -d '{"name":"X"}'
expect "totalSeats 0"                               400 -XPOST "$B/classes" "${J[@]}" -d '{"name":"X","totalSeats":0}'
expect "totalSeats negative"                        400 -XPOST "$B/classes" "${J[@]}" -d '{"name":"X","totalSeats":-1}'
expect "totalSeats > int32"                         400 -XPOST "$B/classes" "${J[@]}" -d '{"name":"X","totalSeats":2147483648}'
expect "totalSeats above limit"                     400 -XPOST "$B/classes" "${J[@]}" -d '{"name":"X","totalSeats":100001}'
expect "totalSeats fractional"                      400 -XPOST "$B/classes" "${J[@]}" -d '{"name":"X","totalSeats":1.5}'
expect "totalSeats boolean"                         400 -XPOST "$B/classes" "${J[@]}" -d '{"name":"X","totalSeats":true}'
expect "name as number"                             400 -XPOST "$B/classes" "${J[@]}" -d '{"name":5,"totalSeats":1}'
expect "body is JSON null"                          400 -XPOST "$B/classes" "${J[@]}" -d 'null'
expect "body is array"                              400 -XPOST "$B/classes" "${J[@]}" -d '[]'
expect "malformed JSON"                             400 -XPOST "$B/classes" "${J[@]}" -d '{"name":'
expect "empty body"                                 400 -XPOST "$B/classes" "${J[@]}"
expect "text/plain content-type still parsed"       201 -XPOST "$B/classes" -H 'Content-Type: text/plain' -d '{"name":"X","totalSeats":1}'
expect "missing content-type still parsed"          201 -XPOST "$B/classes" -d '{"name":"X","totalSeats":1}'

echo "== lookups / injection"
expect "unknown class"                              404 "$B/classes/c_nope"
expect "sql-ish class id"                           404 "$B/classes/x'%20OR%20'1'='1"
expect "very long class id"                         404 "$B/classes/$(printf 'a%.0s' {1..3000})"
expect "unknown hold"                               404 "$B/holds/h_nope"
expect "hold on unknown class"                      404 -XPOST "$B/classes/c_nope/holds" -H "X-Student-Id: $S1"

echo "== X-Student-Id"
expect "missing header"                             400 -XPOST "$B/classes/$CID/holds"
expect "16 digits"                                  400 -XPOST "$B/classes/$CID/holds" -H 'X-Student-Id: 2017990000000000'
expect "18 digits"                                  400 -XPOST "$B/classes/$CID/holds" -H 'X-Student-Id: 201799000000000011'
expect "bengali digits"                             400 -XPOST "$B/classes/$CID/holds" -H 'X-Student-Id: ২০১৭৯৯০০০০০০০০০০১'
expect "letters"                                    400 -XPOST "$B/classes/$CID/holds" -H 'X-Student-Id: 2017990000000000A'
expect "two header values"                          400 -XPOST "$B/classes/$CID/holds" -H "X-Student-Id: $S1" -H "X-Student-Id: $S2"
expect "/me/holds without header"                   400 "$B/me/holds"

echo "== hold lifecycle"
expect "hold S1"                                    201 -XPOST "$B/classes/$CID/holds" -H "X-Student-Id: $S1"
H1=$(echo "$LAST_BODY" | json "['holdId']")
expect "duplicate hold S1"                          409 -XPOST "$B/classes/$CID/holds" -H "X-Student-Id: $S1"
expect "hold S2 (last seat)"                        201 -XPOST "$B/classes/$CID/holds" -H "X-Student-Id: $S2"
H2=$(echo "$LAST_BODY" | json "['holdId']")
expect "class full"                                 409 -XPOST "$B/classes/$CID/holds" -H "X-Student-Id: $S3"
expect "GET hold (no header needed)"                200 "$B/holds/$H1"
expect "confirm without header"                     400 -XPOST "$B/holds/$H1/confirm"
expect "confirm by other student"                   403 -XPOST "$B/holds/$H1/confirm" -H "X-Student-Id: $S2"
expect "cancel by other student"                    403 -XDELETE "$B/holds/$H1" -H "X-Student-Id: $S2"
expect "confirm S1"                                 200 -XPOST "$B/holds/$H1/confirm" -H "X-Student-Id: $S1"
expect "confirm S1 again (idempotent)"              200 -XPOST "$B/holds/$H1/confirm" -H "X-Student-Id: $S1"
expect "confirm with body (ignored)"                200 -XPOST "$B/holds/$H1/confirm" -H "X-Student-Id: $S1" "${J[@]}" -d '{"x":1}'
expect "cancel confirmed"                           409 -XDELETE "$B/holds/$H1" -H "X-Student-Id: $S1"
expect "cancel S2"                                  204 -XDELETE "$B/holds/$H2" -H "X-Student-Id: $S2"
expect "cancel S2 again (idempotent)"               204 -XDELETE "$B/holds/$H2" -H "X-Student-Id: $S2"
expect "confirm cancelled"                          409 -XPOST "$B/holds/$H2/confirm" -H "X-Student-Id: $S2"
expect "S2 re-applies after cancel"                 201 -XPOST "$B/classes/$CID/holds" -H "X-Student-Id: $S2"
expect "S1 re-applies after admission"              409 -XPOST "$B/classes/$CID/holds" -H "X-Student-Id: $S1"
expect "/me/holds S2"                               200 "$B/me/holds" -H "X-Student-Id: $S2"
[[ $(echo "$LAST_BODY" | json ".__len__()") == 2 ]] && { echo "PASS /me/holds lists both S2 applications"; pass=$((pass+1)); } || { echo "FAIL /me/holds count: $LAST_BODY"; fail=$((fail+1)); }

echo "== HTTP surface"
expect "PUT /classes not allowed"                   405 -XPUT "$B/classes" "${J[@]}" -d '{}'
expect "PATCH /holds/{id} not allowed"              405 -XPATCH "$B/holds/$H1"
expect "unknown route"                              404 "$B/does-not-exist"
expect "CORS preflight"                             204 -XOPTIONS "$B/classes/$CID/holds" -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: x-student-id'
expect "health"                                     200 "$B/health"

echo
echo "passed=$pass failed=$fail"
[[ $fail -eq 0 ]]
