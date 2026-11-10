# AI Usage

## Tool

**Claude Code** (Anthropic, model Claude Opus 5.5), running in the Claude desktop app with shell, file, and browser access.

## Where AI was used

- **Backend:**
  - Project scaffolding.
  - SQL schema and the locking design in `AdmissionService`.
  - Error handling middleware.
  - Config handling.
  - The xUnit test suite, including the concurrency and multi-instance tests.
- **Frontend:**
  - API client with error-code → Bengali message mapping.
  - Polling and countdown hooks.
  - All pages.
  - Integration of Arc UI and Border Beam components.
  - Vitest tests.
- **Docker:** multi-stage Dockerfiles, nginx config, runtime `config.js` generation, compose file with test and
  multi-process profiles.
- **Docs:** README, ASSUMPTIONS, and this file.
- **Verification:**
  - AI ran the backend against Postgres and smoke-tested every endpoint with `curl`.
  - It ran both test suites locally and in Docker.
  - It used the browser to click through the UI: apply, countdown, pay, toast.

## Where the AI got it wrong, and how it was caught

1. **Connection pool exhaustion under load.**
   - *Mistake:* the first version used Npgsql's default pool (100). Several API instances, or one burst, could exceed
     Postgres' `max_connections=100`.
   - *How it was caught:* the concurrency test (200 simultaneous applications for 10 seats) still created exactly 10
     holds. But it expected 190 × `409` and got 168. The assertion was changed to print the status breakdown, which
     showed `409x154, 201x10, 503x36`.
   - *Fix:* cap the pool per process (`DB_MAX_POOL_SIZE`, default 30) and raise Postgres to `max_connections=200`. A
     burst now queues for a connection.
   - The seat invariant itself was never violated. The bug was in availability, not correctness.

2. **UI components written for a newer React.**
   - *Mistake:* the Arc UI components were added to a React 18 project.
   - *How it was caught:* `tsc -b` failed (`inert` is not a known prop, `ref.current` is read-only) even though the
     tests passed.
   - *Fix:* upgrade to React 19, which the brief allows ("React 18 or newer").

3. **Countdown clipped and oversized.**
   - *Mistake:* the Arc countdown sizes its digits with container queries (`cqi`). Inside a grid with
     `justify-items: start`, it was first clipped off the left edge. After stretching, it became huge.
   - *How it was caught:* screenshots in the browser. Unit tests could not catch this.
   - *Fix:* stretch the container and cap its width.

4. **English strings leaking into a Bengali UI.**
   - *Mistake:* vendored components had hard-coded English ("Minutes", "Completed", "Step 1 of 3"; an early usage-meter version also said "used" and "Almost full"), and the countdown's
     screen-reader text added an English plural `s`.
   - *How it was caught:* visual review in the browser and reading the component source.
   - *Fix:* localize the strings in the vendored source.

5. **Test expectations tied to old markup.**
   - *Mistake:* after the restyle, tests still matched exact text (`'00:05'`, a single `'25'`). The animated counter
     renders digits in several spans.
   - *How it was caught:* re-running the test suite.
   - *Fix:* tests now assert behaviour (`data-seconds-left`, status badge, disabled buttons) instead of exact markup.

## Stress testing and what it found

After the features were done, the AI ran a dedicated round of stress and edge-case testing (all scripts are in
`stress/`, see the README):

- **k6 load test** (`stress/admission.js`): 600 simultaneous applicants for one 50-seat class, plus ~250 users doing
  apply / confirm / double-confirm / cancel / abandon, plus 40 polling readers. Requests alternated between two backend
  processes on one database, holds lasted 8 s so expiry churned constantly, and a watcher checked the seat invariant
  every 200 ms.
- **SQL integrity check** (`stress/check-invariants.sql`) on the database afterwards.
- **58 black-box edge-case probes** (`stress/edge-cases.sh`): bad JSON, overflowing numbers, wrong types, SQL-ish IDs,
  Bengali text, header abuse, wrong methods, CORS.
- **Failure drills:**
  - restarting PostgreSQL under live traffic,
  - starting the backend while the database is down,
  - 534,000 rows of history.
- **Browser checks:**
  - a real end-to-end expiry with no reload,
  - a hostile class name (`<img onerror=…>`),
  - 375 px phone width.

**What held up:**
- In every run: 0 seat-invariant violations, 0 duplicate active holds, and no confirmation after a deadline.
- Exactly 50 of 600 burst applicants got a seat.
- p95 latency stayed around 5 ms at ~750 requests/s.
- `GET /classes` stayed at ~15 ms with 534k rows of history.
- The backend suite passed 6 runs in a row with no flaky tests.

**Bugs found and fixed:**

6. **`POST /classes` without `Content-Type: application/json` returned a misleading `404 No endpoint`.**
   - *Cause:* minimal-API body binding skips the endpoint when the content type doesn't match, and the catch-all
     `MapFallback` then answered.
   - *Impact:* a test client or tool that omits the header would think the endpoint doesn't exist.
   - *How it was caught:* the edge-case probe.
   - *Fix:* the body is parsed by hand, whatever the content type.
   - *Regression test:* `RobustnessTests.Create_class_accepts_json_body_regardless_of_content_type`.
7. **Wrong HTTP methods returned 404 instead of 405.**
   - *Cause:* the same `MapFallback` swallowed method mismatches.
   - *How it was caught:* the edge-case probe.
   - *Fix:* the fallback was replaced by middleware that writes JSON bodies for 404/405 without hiding routing results.
   - *Regression test:* `Wrong_method_is_405_with_json_body_and_unknown_route_is_404`.
8. **Restarting the database under load produced a `500` instead of the friendly `503`.**
   - *Cause:* while the `db` container restarts, even resolving its hostname fails, and that `SocketException` reached
     the client unwrapped by Npgsql.
   - *How it was caught:* the DB-restart drill: 1 of ~220 requests got 500. The backend logs showed
     `SocketException: Name or service not known`.
   - *Fix:* treat it as "database unavailable".
   - *Verified:* two more restarts under traffic gave only 503s during the outage, then full recovery.
9. **Phone layout overflowed horizontally.**
   - *Cause:* at 375 px the dark-mode button was pushed off-screen.
   - *How it was caught:* measuring `scrollWidth` in the browser with a mobile viewport.
   - *Fix:* on phones the button moves into the brand row, the tabs scroll inside their own row, and the summary strip
     becomes a compact 3-column row.
10. **Browsers could keep running an old build after a redeploy.**
    - *Cause:* nginx sent no cache headers for `index.html`.
    - *How it was caught:* the mobile CSS fix above didn't appear until a cache-busting reload.
    - *Fix:* `index.html` is `no-cache`, hashed `/assets/*` are `immutable`, and gzip is on.
11. **Background tabs could show stale state.**
    - *Cause:* browsers throttle timers in hidden tabs.
    - *Fix:* polling and the countdown now refresh the moment a tab becomes visible again.
    - *Test:* `polling › refetches immediately when the tab becomes visible again`.

**Mistakes the AI made in its own test tooling (not app bugs), and how they were spotted:**
- The first k6 teardown re-checked the 8-second burst holds 100 s later, after they had legitimately expired. That
  looked like a seat-count failure. Reading the numbers showed the holds were simply gone.
- Deliberate "stranger pays" requests (403) weren't marked as expected, so they showed up as failures.
- The Bengali-name probe failed because Git Bash on Windows mangles non-ASCII **command-line arguments** to `curl.exe`
  (it sent `????`). Python showed the server stores and returns correct UTF-8, so the probe now sends the body from a
  file.
- One expiry check in the browser seemed to show a hold that never expired. In fact a `docker compose up` for the
  frontend had recreated the backend without `HOLD_DURATION_SECONDS=8`, so the hold really had 600 s. The UI was
  right.
- The backend tests once all failed after a 2.5-minute wait. They pointed at a Postgres container that had been removed
  earlier, and Testcontainers was the fix.
- A frontend test for "cancel" clicked the confirm button too quickly. Arc's ConfirmMorph deliberately ignores a
  confirm within 280 ms of the prompt opening (double-click protection), so the test now waits like a person would.

## What was checked by hand rather than trusted

- **Concurrency:** the row-lock design was reasoned through for each race:
  - hold vs hold,
  - confirm vs expiry,
  - confirm vs confirm.

  It was then exercised by the tests.
- **Contract:** every API response was compared field-by-field with the brief using `curl`.
- **Persistence:** `docker compose down` → `up` keeps the data.
