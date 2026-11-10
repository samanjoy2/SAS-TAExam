using Npgsql;

namespace SchoolAdmission.Api.Infrastructure;

/// <summary>
/// Creates the schema on startup (idempotent). Guarded by a Postgres advisory lock so that
/// several backend processes starting at the same time do not race on DDL.
/// Retries for a while because in docker compose the database may still be booting.
/// </summary>
public static class DatabaseInitializer
{
    private const long SchemaLockKey = 0x5C400_1A11;

    private const string Schema = """
        CREATE TABLE IF NOT EXISTS classes (
            id           text        PRIMARY KEY,
            name         text        NOT NULL,
            total_seats  integer     NOT NULL CHECK (total_seats > 0),
            created_at   timestamptz NOT NULL DEFAULT clock_timestamp()
        );

        CREATE TABLE IF NOT EXISTS holds (
            id            text        PRIMARY KEY,
            class_id      text        NOT NULL REFERENCES classes(id),
            student_id    varchar(17) NOT NULL,
            status        text        NOT NULL CHECK (status IN ('HELD','CONFIRMED','EXPIRED','CANCELLED')),
            created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
            expires_at    timestamptz NOT NULL,
            confirmed_at  timestamptz NULL,
            cancelled_at  timestamptz NULL
        );

        CREATE INDEX IF NOT EXISTS ix_holds_class_status ON holds (class_id, status);
        CREATE INDEX IF NOT EXISTS ix_holds_student      ON holds (student_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS ix_holds_held_expiry  ON holds (expires_at) WHERE status = 'HELD';

        -- Safety net for the duplicate rule: at most one HELD/CONFIRMED row per (class, student).
        CREATE UNIQUE INDEX IF NOT EXISTS ux_holds_active_per_student
            ON holds (class_id, student_id) WHERE status IN ('HELD','CONFIRMED');
        """;

    public static async Task InitializeAsync(NpgsqlDataSource dataSource, ILogger logger, CancellationToken ct = default)
    {
        var attempt = 0;
        while (true)
        {
            try
            {
                await using var conn = await dataSource.OpenConnectionAsync(ct);
                await using var tx = await conn.BeginTransactionAsync(ct);
                await using (var lockCmd = new NpgsqlCommand("SELECT pg_advisory_xact_lock(@k)", conn, tx))
                {
                    lockCmd.Parameters.AddWithValue("k", SchemaLockKey);
                    await lockCmd.ExecuteNonQueryAsync(ct);
                }
                await using (var cmd = new NpgsqlCommand(Schema, conn, tx))
                {
                    await cmd.ExecuteNonQueryAsync(ct);
                }
                await tx.CommitAsync(ct);
                logger.LogInformation("Database schema is ready");
                return;
            }
            catch (Exception ex) when ((ex is NpgsqlException or System.Net.Sockets.SocketException or TimeoutException) && attempt < 30)
            {
                attempt++;
                logger.LogWarning("Database not ready yet (attempt {Attempt}): {Message}", attempt, ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(2), ct);
            }
        }
    }
}
