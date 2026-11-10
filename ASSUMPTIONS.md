# Assumptions

Where the brief was silent, these are the choices made and why.

## Identity and input

- **Student ID** must be exactly 17 ASCII digits (`^[0-9]{17}$`). There is no checksum or birth-year check, because the
  brief only says "17-digit birth registration number". Missing or malformed `X-Student-Id` returns `400`.
- **Which endpoints need `X-Student-Id`:** only the ones the brief lists it for (create hold, confirm, cancel, `/me/holds`).
  `GET /holds/{id}` and the class endpoints are public, as specified. The hold ID is an unguessable GUID.
- **Someone else's hold:** confirming or cancelling a hold that belongs to another student returns `403 NOT_YOUR_HOLD`.
- **Admin** has no authentication, because the brief says there is no login system. Anyone using the UI can create classes.
- **Class input:** name is required, trimmed, at most 200 characters. `totalSeats` is a whole number from 1 to 100000.
- **Class names are not unique.** Two classes may have the same name. Automated tests are likely to create
  "Class 6 - Morning Shift" many times against the same database, and rejecting duplicates would break them.
- Classes cannot be edited or deleted. The brief asks only for creation.

## Holds and admission rules

- **Duplicate rule:** per class, a student may have at most one hold that is `HELD` (and not lapsed) or `CONFIRMED`.
  Trying again gives `409 DUPLICATE_APPLICATION` (still held) or `409 ALREADY_ADMITTED` (confirmed).
  After a hold expires or is cancelled, the student may apply again.
- **Different shifts are different classes**, so the same student may hold seats in both Morning and Day shift at once.
  The brief only restricts the same class, and choosing between shifts is the school's call.
- **Order of checks** when applying: class exists (404), then duplicate (409), then capacity (409 `SEATS_FULL`).
  This gives the student the most specific reason.
- **Confirm is idempotent:** confirming an already `CONFIRMED` hold returns `200` again and changes nothing.
- **Confirm after expiry** returns `409 HOLD_EXPIRED`, not `410`, because the brief uses 409 for state conflicts.
  Confirming a cancelled hold returns `409 HOLD_CANCELLED`.
- **Cancel:**
  - `HELD` becomes `CANCELLED` and returns `204`.
  - Cancelling again returns `204` (idempotent).
  - A `CONFIRMED` admission cannot be cancelled (`409 HOLD_ALREADY_CONFIRMED`): the fee is paid, and refunds are out of scope.
  - An expired hold returns `409 HOLD_EXPIRED`.
- **Status responses:** `GET /holds/{id}` returns the *effective* status, so a lapsed `HELD` hold is reported as
  `EXPIRED` at once, even before the background job rewrites the row.
- **Extra response fields** (allowed by the brief): `GET /holds/{id}` adds `studentId`, `className`, `createdAt`,
  `confirmedAt`, `cancelledAt`. `/me/holds` adds `createdAt`. Lists are ordered newest first; classes by creation time.
- **Errors** always use the shape `{ "error": CODE, "message": text }`. The UI maps `CODE` to Bengali messages.
  If the database is down, the API returns `503 DATABASE_UNAVAILABLE`.
- **IDs** are `c_<guid>` and `h_<guid>`, following the example style.

## Expiry and time

- `expiresAt = creation time + HOLD_DURATION_SECONDS`. Invalid or non-positive values fall back to 600.
- **No API call is needed for expiry.** A seat counts as taken only if its hold is `CONFIRMED`, or `HELD` with
  `expires_at > now`. Expiry therefore takes effect the instant the deadline passes. A background job runs every 5 s
  and rewrites lapsed rows to `EXPIRED`, which keeps the stored data tidy; correctness does not depend on it.
- **All server time comparisons use the database clock** (`clock_timestamp()`), so several backend processes agree even
  if their own clocks differ.
- The UI countdown uses the browser clock and assumes it is roughly in sync with the server. On expiry the UI flips to
  `EXPIRED` locally, then refetches to confirm with the server.

## Concurrency: how `heldSeats + confirmedSeats <= totalSeats` is guaranteed (bonus 1)

The guarantee is enforced **inside PostgreSQL**, not in application memory. That makes it hold for any number of
threads *and* any number of backend processes sharing the database.

`POST /classes/{id}/holds` runs in one transaction:

1. `SELECT total_seats FROM classes WHERE id = $1 FOR UPDATE` takes a row lock on the class. Every other attempt for the
   same class, from any process, waits here. Different classes do not block each other.
2. Lapsed `HELD` holds of that class are marked `EXPIRED`.
3. Duplicate check for this student.
4. `COUNT(*)` of `HELD` + `CONFIRMED` holds. If the count is already `>= total_seats`, the request gets `409`.
5. `INSERT` the hold, then `COMMIT`, which releases the lock.

Because steps 3–5 run while holding the class lock, no two transactions can both see "one seat left". Other paths:

- **Confirm and cancel** lock the hold row (`FOR UPDATE`).
- Confirm turns `HELD` into `CONFIRMED`, so `held + confirmed` does not change and cannot overflow.
- If a confirm races with an expiry, the row lock decides: either it confirms before the deadline, or it sees
  `EXPIRED` and returns 409.
- Repeated or parallel confirms all see `CONFIRMED` after the first one, so `confirmedSeats` grows only once.

A partial unique index `(class_id, student_id) WHERE status IN ('HELD','CONFIRMED')` is a second safety net for the
duplicate rule.

Schema creation at startup takes a Postgres advisory lock, so two processes starting at once do not race on DDL.

This is verified by `Two_api_instances_sharing_the_database_never_oversell`: two independent API hosts with separate
connection pools, 120 parallel requests for 7 seats, and exactly 7 succeed. Try it live with
`docker compose --profile multi up` (ports 8080 and 8081).

**Connection limits:** each process caps its pool at 30 connections (`DB_MAX_POOL_SIZE`), and Postgres runs with
`max_connections=200`. A burst queues for a connection instead of failing with "too many clients". An earlier version
without the cap returned 503 under the 200-request test.

## Persistence

- PostgreSQL data lives in the named Docker volume `pgdata`. It survives container restarts and `docker compose down`.
- The browser stores only the student ID (in `localStorage`). Applications always come from the server, so they
  survive refresh, browser restarts, and switching devices.

## Frontend

- **React 19** is used. The brief says "React 18 or newer", and the Arc UI components are written for React 19 types.
- UI text is in **Bengali**, matching the brief's audience. API codes and statuses stay in English (`HELD`, ...).
- **The UI runs on port 3000.** The backend URL is read at container start from `API_BASE_URL`, written into `/config.js`.
  Changing it needs a container restart, not a rebuild. CORS on the API allows any origin.
- **Polling intervals:**
  - Class list: every 3 s.
  - Application page: every 3 s.
  - "My applications": every 4 s.
  - The countdown itself updates every 0.5 s on the client.
- **Failed refreshes:** if a background refresh fails (for example, the server is down), the last data stays on screen
  with a warning, and polling keeps retrying.
- **UI libraries:** the user pointed at a set of UI component sites. From them we used:
  - **Arc UI** (free tier), installed as source via the shadcn CLI so it can be localized.
  - **Border Beam** from libraries.dev (MIT), which highlights applications still waiting for payment.

  Hard-coded English strings in the vendored Arc components (countdown units, usage meter captions) were translated
  to Bengali.
