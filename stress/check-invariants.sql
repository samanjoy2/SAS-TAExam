-- Database-level integrity check, run after a stress test:
--   docker compose exec -T db psql -U admission -d admission -f - < stress/check-invariants.sql
-- Every query must return 0 rows / 0.

\echo '1. classes where active (HELD not lapsed + CONFIRMED) holds exceed total_seats'
SELECT c.id, c.name, c.total_seats, COUNT(h.id) AS active
FROM classes c JOIN holds h ON h.class_id = c.id
WHERE h.status = 'CONFIRMED' OR (h.status = 'HELD' AND h.expires_at > clock_timestamp())
GROUP BY c.id HAVING COUNT(h.id) > c.total_seats;

\echo '2. classes where HELD+CONFIRMED rows (ignoring time) exceed total_seats'
SELECT c.id, c.name, c.total_seats, COUNT(h.id) AS rows
FROM classes c JOIN holds h ON h.class_id = c.id AND h.status IN ('HELD','CONFIRMED')
GROUP BY c.id HAVING COUNT(h.id) > c.total_seats;

\echo '3. students with more than one HELD/CONFIRMED hold in the same class'
SELECT class_id, student_id, COUNT(*) FROM holds
WHERE status IN ('HELD','CONFIRMED') GROUP BY class_id, student_id HAVING COUNT(*) > 1;

\echo '4. inconsistent timestamps (confirmed without confirmed_at, confirmed after expiry, cancelled without cancelled_at)'
SELECT id, status, expires_at, confirmed_at, cancelled_at FROM holds
WHERE (status = 'CONFIRMED' AND (confirmed_at IS NULL OR confirmed_at > expires_at))
   OR (status = 'CANCELLED' AND cancelled_at IS NULL);

\echo '5. HELD rows lapsed for more than 30s (sweeper not keeping up)'
SELECT COUNT(*) AS stale_held FROM holds WHERE status = 'HELD' AND expires_at < clock_timestamp() - interval '30 seconds';

\echo 'summary by status'
SELECT status, COUNT(*) FROM holds GROUP BY status ORDER BY status;
