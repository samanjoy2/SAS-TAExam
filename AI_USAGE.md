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
   - *Mistake:* vendored components had hard-coded English ("Minutes", "used", "Almost full"), and the countdown's
     screen-reader text added an English plural `s`.
   - *How it was caught:* visual review in the browser and reading the component source.
   - *Fix:* localize the strings in the vendored source.

5. **Test expectations tied to old markup.**
   - *Mistake:* after the restyle, tests still matched exact text (`'00:05'`, a single `'25'`). The animated counter
     renders digits in several spans.
   - *How it was caught:* re-running the test suite.
   - *Fix:* tests now assert behaviour (`data-seconds-left`, status badge, disabled buttons) instead of exact markup.

## What was checked by hand rather than trusted

- **Concurrency:** the row-lock design was reasoned through for each race:
  - hold vs hold,
  - confirm vs expiry,
  - confirm vs confirm.

  It was then exercised by the tests.
- **Contract:** every API response was compared field-by-field with the brief using `curl`.
- **Persistence:** `docker compose down` → `up` keeps the data.
