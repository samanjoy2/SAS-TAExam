# School Admission System (স্কুল ভর্তি সিস্টেম)

Online, first-come-first-served school admission. Parents apply for a seat in a class (each shift is its own class),
the seat is **held** for a limited time, and paying the admission fee **confirms** it. Unpaid holds expire on their
own and the seat goes back to the pool.

- **Backend:** C# / .NET 8 minimal API, PostgreSQL 16, Npgsql + Dapper (`backend/`)
- **Frontend:** React 19 + TypeScript + Vite, [Arc UI](https://uiarc.dev) components (shadcn registry),
  [Border Beam](https://libraries.dev) effect, Tailwind CSS v4 (`frontend/`)
- **Everything runs in Docker.** Nothing else needs to be installed.

## Run it

```bash
docker compose up
```

The first run builds the images (a few minutes). After that:

| What | URL |
|---|---|
| **Frontend (UI)** | **http://localhost:3000** |
| Backend API | http://localhost:8080 (e.g. `GET /classes`) |
| Health check | http://localhost:8080/health |

Stop with `Ctrl+C` or `docker compose down`. Data lives in the named volume `pgdata`, so it survives
`docker compose down` → `docker compose up`. (Only `docker compose down -v` deletes it.)

### Using the UI

1. **ক্লাস তৈরি (Admin)** tab: create classes, e.g. `Class 6 - Morning Shift`, 120 seats.
2. Type the student's **17-digit birth registration number** in the field at the top. It is remembered in the browser,
   so refreshing or reopening the browser keeps the student's applications visible.
3. **ক্লাস তালিকা** tab: live seat counts (refresh every 3 s). Click **আবেদন করুন** to hold a seat.
4. The application page shows the status and a live countdown. **ভর্তি ফি দিন** confirms (payment is simulated),
   **বাতিল** cancels. When time runs out, the status turns `EXPIRED` and the pay button disables without a reload.
5. **আমার আবেদন** tab: all applications of the current student.

### Configuration (environment variables)

| Variable | Default | Used by | Meaning |
|---|---|---|---|
| `HOLD_DURATION_SECONDS` | `600` | backend | How long a hold lasts before it expires |
| `ConnectionStrings__Default` | compose points it at the `db` service | backend | PostgreSQL connection string (`DB_CONNECTION_STRING` also works) |
| `DB_MAX_POOL_SIZE` | `30` | backend | Max DB connections per backend process |
| `API_BASE_URL` | `http://localhost:8080` | frontend | Backend URL the browser calls; applied at container start, no rebuild needed |
| `FRONTEND_PORT` | `3000` | compose | Host port for the UI |

Example: `HOLD_DURATION_SECONDS=60 docker compose up` gives one-minute holds, which makes expiry easy to watch.

## Automated tests

All tests run in Docker:

```bash
docker compose --profile test run --rm --build backend-tests
```

```bash
docker compose --profile test run --rm --build frontend-tests
```

**Backend** (`backend/tests`, xUnit, 30 tests against a real PostgreSQL). In Docker they use the compose `db` service
with a separate `admission_test` database. Run locally with `dotnet test` from `backend/`, which starts a throwaway
Postgres via Testcontainers (needs Docker), or set `TEST_DB_CONNECTION_STRING` to use your own server.

- `ConcurrencyTests`: 200 students apply for 10 seats at the same moment, and exactly 10 holds are created (the
  others get `409`). The same student applying 30 times at once gets one hold. 20 parallel confirms count once.
  Two separate API instances sharing one database never oversell (the bonus requirement).
- `AdmissionRulesTests`: contract fields, validation (`400`), unknown class (`404`), full class (`409 SEATS_FULL`),
  duplicate/already-admitted, owner-only confirm/cancel (`403`), cancel frees the seat, automatic expiry frees the
  seat and blocks confirm, `/me/holds` only shows the caller's applications.
- `RobustnessTests`: confirm and cancel racing on the same hold (exactly one wins), confirms fired across the expiry
  deadline (never confirmed late), any/no `Content-Type` on `POST /classes`, JSON 404/405, Bengali names.

**Frontend** (`frontend/src/**/*.test.ts(x)`, Vitest + Testing Library, 24 tests):

- countdown hitting zero flips the status to `EXPIRED` and disables pay with no reload;
- seat counts auto-refresh, and polling catches up when a background tab is shown;
- server-down / seats-full / expired errors show readable messages, and stale data stays visible on a failed refresh;
- admin form validation and the exact request body;
- pay and cancel (with confirmation) send the right requests;
- class names render as text, not HTML;
- student ID validation and persistence. Locally: `cd frontend && npm ci && npm test`.

## Stress and edge-case testing

Scripts live in `stress/`. Run them against the running stack, using short holds and both backends so expiry and
multi-process contention are exercised:

```bash
HOLD_DURATION_SECONDS=8 docker compose --profile multi up -d --build
```

```bash
docker compose --profile stress run --rm stress
```

```bash
docker compose exec -T db psql -U admission -d admission -f - < stress/check-invariants.sql
```

```bash
bash stress/edge-cases.sh http://localhost:8080
```

- `stress/admission.js` (k6, runs in a container) combines four scenarios:
  - **burst:** 600 simultaneous applicants for one 50-seat class;
  - **mixed:** ~250 users applying, confirming (and re-confirming via the other process), cancelling, abandoning, and
    paying for someone else;
  - **readers:** 40 parents polling the class list and their applications;
  - **invariant:** a watcher that fails the run if `held + confirmed > total` is ever observed.

  Thresholds fail the run on any 5xx, any unexpected status, or any invariant violation.
- `stress/check-invariants.sql` checks the stored data afterwards: no class over capacity, no duplicate active holds,
  no confirmation after its deadline, and the sweeper keeping up.
- `stress/edge-cases.sh` runs 58 black-box probes covering validation, injection-looking IDs, header abuse, the
  lifecycle, 404/405 and CORS.

Typical result on a laptop: ~75k requests at ~750 req/s, p95 ≈ 5 ms, 0 errors, 0 invariant violations. Exactly 50 of
the 600 burst applicants get a seat. The findings and fixes are listed in `AI_USAGE.md`.

## Bonus: two backend processes on one database

```bash
docker compose --profile multi up
```

This starts a second backend on **http://localhost:8081** next to the one on 8080, both using the same database.
The seat limit still holds; `ASSUMPTIONS.md` explains why.

## Project layout

```
backend/
  src/SchoolAdmission.Api/     API (Program.cs, Endpoints.cs, Domain/AdmissionService.cs = all business rules)
  tests/SchoolAdmission.Tests/ xUnit integration + concurrency tests
  Dockerfile                   build / test / runtime stages
stress/                        k6 load test, SQL invariant check, edge-case probes
frontend/
  src/pages/                   Classes, Admin, Application, My applications
  src/components/              HoldCard, StudentBar, Alert + arc/ (Arc UI source)
  src/lib/                     API client (error messages), polling hooks, student id store
  Dockerfile, nginx.conf       nginx serves the build; config.js is generated from API_BASE_URL
docker-compose.yml
ASSUMPTIONS.md                 decisions where the brief was silent
AI_USAGE.md                    how AI tools were used
```

## API summary

| Method | Path | Success | Notable errors |
|---|---|---|---|
| POST | `/classes` | 201 | 400 invalid input |
| GET | `/classes` | 200 | |
| GET | `/classes/{classId}` | 200 | 404 |
| POST | `/classes/{classId}/holds` | 201 | 400 bad/missing `X-Student-Id`, 404, 409 `SEATS_FULL` / `DUPLICATE_APPLICATION` / `ALREADY_ADMITTED` |
| GET | `/holds/{holdId}` | 200 | 404 |
| POST | `/holds/{holdId}/confirm` | 200 (repeatable) | 403 not yours, 404, 409 `HOLD_EXPIRED` / `HOLD_CANCELLED` |
| DELETE | `/holds/{holdId}` | 204 | 403, 404, 409 `HOLD_EXPIRED` / `HOLD_ALREADY_CONFIRMED` |
| GET | `/me/holds` | 200 | 400 bad/missing `X-Student-Id` |

Errors always come back as JSON: `{ "error": "SEATS_FULL", "message": "No seats are available in this class." }`.
