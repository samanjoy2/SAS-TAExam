// k6 stress test for the admission API.
//
// Run (from repo root, stack already up; second backend optional):
//   HOLD_DURATION_SECONDS=8 docker compose --profile multi up -d
//   docker compose --profile stress run --rm stress
//
// Scenarios (run in parallel):
//   burst     – 600 students hit one 50-seat class at the same instant.
//   mixed     – ramping 0→250 VUs doing apply / confirm / double-confirm / cancel / abandon (expire)
//               on a few small classes, with a shared student pool so duplicates and re-applies happen.
//   readers   – parents polling GET /classes and /me/holds like the UI does.
//   invariant – a watcher that reads every class continuously and fails on any broken seat invariant.
// Requests alternate between BASE_URLS (e.g. two backend processes on one DB).

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate } from 'k6/metrics'
import exec from 'k6/execution'

const BASES = (__ENV.BASE_URLS || 'http://localhost:8080').split(',').map((s) => s.trim()).filter(Boolean)
const DURATION = __ENV.DURATION || '60s'

const invariantViolations = new Counter('invariant_violations')
const unexpectedStatus = new Counter('unexpected_status')
const serverErrors = new Rate('server_errors')
const burstCreated = new Counter('burst_created')
const confirmedOk = new Counter('confirm_ok')
const conflicts = new Counter('conflict_409')

// 403 is expected for the deliberate 'stranger pays' requests.
http.setResponseCallback(http.expectedStatuses(200, 201, 204, 403, 409))

export const options = {
  scenarios: {
    burst: { executor: 'per-vu-iterations', vus: 600, iterations: 1, exec: 'burst', startTime: '2s', maxDuration: '60s' },
    mixed: {
      executor: 'ramping-vus',
      exec: 'mixed',
      startTime: '5s',
      stages: [
        { duration: '15s', target: 250 },
        { duration: DURATION, target: 250 },
        { duration: '10s', target: 0 },
      ],
    },
    readers: { executor: 'constant-vus', vus: 40, duration: '90s', exec: 'readers', startTime: '5s' },
    invariant: { executor: 'constant-vus', vus: 1, duration: '100s', exec: 'invariant' },
  },
  thresholds: {
    invariant_violations: ['count==0'],
    burst_created: ['count==50'], // exactly the 50 seats, never more
    unexpected_status: ['count==0'],
    server_errors: ['rate==0'],
    http_req_failed: ['rate==0'],
    'http_req_duration{scenario:readers}': ['p(95)<500'],
    'http_req_duration{scenario:mixed}': ['p(95)<1000'],
  },
}

const json = { headers: { 'Content-Type': 'application/json' } }
const base = () => BASES[(exec.vu.idInTest || 0) % BASES.length]
const sid = (n) => '2016' + String(n).padStart(13, '0') // 17 digits
const pick = (a) => a[Math.floor(Math.random() * a.length)]

function track(res, allowed) {
  serverErrors.add(res.status >= 500 || res.status === 0)
  if (!allowed.includes(res.status)) {
    unexpectedStatus.add(1)
    console.error(`unexpected ${res.request.method} ${res.url} -> ${res.status} ${res.body}`)
  }
  if (res.status === 409) conflicts.add(1)
  return res
}

export function setup() {
  const b = BASES[0]
  const mk = (name, seats) => {
    const r = http.post(`${b}/classes`, JSON.stringify({ name, totalSeats: seats }), json)
    if (r.status !== 201) throw new Error(`setup failed: ${r.status} ${r.body}`)
    return r.json('id')
  }
  const run = Date.now()
  return {
    burstClass: mk(`Stress burst ${run}`, 50),
    mixedClasses: [mk(`Stress A ${run}`, 400), mk(`Stress B ${run}`, 150), mk(`Stress C ${run}`, 10), mk(`Stress D ${run}`, 1)],
  }
}

export function burst(data) {
  const res = track(
    http.post(`${base()}/classes/${data.burstClass}/holds`, null, { headers: { 'X-Student-Id': sid(1_000_000 + exec.vu.idInTest) } }),
    [201, 409],
  )
  if (res.status === 201) burstCreated.add(1)
}

export function mixed(data) {
  const student = sid(Math.floor(Math.random() * 1500)) // shared pool -> duplicates, re-applies
  const h = { headers: { 'X-Student-Id': student } }
  const classId = pick(data.mixedClasses)
  const res = track(http.post(`${base()}/classes/${classId}/holds`, null, h), [201, 409])
  if (res.status === 201) {
    const holdId = res.json('holdId')
    check(res, { 'hold has contract fields': (r) => r.json('status') === 'HELD' && !!r.json('expiresAt') && r.json('classId') === classId })
    sleep(Math.random() * 2)
    const roll = Math.random()
    if (roll < 0.12) {
      const c = track(http.post(`${base()}/holds/${holdId}/confirm`, null, h), [200, 409])
      if (c.status === 200) confirmedOk.add(1)
      if (roll < 0.06) {
        // idempotency: confirm again, via the other process when there are two
        const other = BASES[(BASES.indexOf(base()) + 1) % BASES.length]
        const again = track(http.post(`${other}/holds/${holdId}/confirm`, null, h), [200, 409])
        if (c.status === 200) check(again, { 'second confirm is 200': (r) => r.status === 200 })
      }
    } else if (roll < 0.4) {
      track(http.del(`${base()}/holds/${holdId}`, null, h), [204, 409])
    } else if (roll < 0.5) {
      // a stranger tries to pay for someone else's hold
      track(http.post(`${base()}/holds/${holdId}/confirm`, null, { headers: { 'X-Student-Id': sid(9_999_999) } }), [403])
    } // else: abandon -> expires
    track(http.get(`${base()}/holds/${holdId}`), [200])
  }
  sleep(Math.random() * 0.5)
}

export function readers(data) {
  track(http.get(`${base()}/classes`), [200])
  track(http.get(`${base()}/me/holds`, { headers: { 'X-Student-Id': sid(Math.floor(Math.random() * 1500)) } }), [200])
  track(http.get(`${base()}/classes/${pick(data.mixedClasses)}`), [200])
  sleep(1)
}

export function invariant(data) {
  for (const b of BASES) {
    const res = http.get(`${b}/classes`)
    if (res.status !== 200) {
      unexpectedStatus.add(1)
      continue
    }
    for (const c of res.json()) {
      const ok =
        c.heldSeats >= 0 &&
        c.confirmedSeats >= 0 &&
        c.availableSeats >= 0 &&
        c.heldSeats + c.confirmedSeats <= c.totalSeats &&
        c.availableSeats === c.totalSeats - c.heldSeats - c.confirmedSeats
      if (!ok) {
        invariantViolations.add(1)
        console.error(`INVARIANT BROKEN ${JSON.stringify(c)}`)
      }
    }
  }
  sleep(0.2)
}

export function teardown(data) {
  // Holds may have expired by now (short HOLD_DURATION_SECONDS), so only report; the burst result is
  // checked by the burst_created threshold and the live invariant watcher.
  const b = BASES[0]
  for (const id of [data.burstClass, ...data.mixedClasses]) console.log(`class: ${JSON.stringify(http.get(`${b}/classes/${id}`).json())}`)
}
