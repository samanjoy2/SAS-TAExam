using Dapper;
using Npgsql;
using SchoolAdmission.Api.Infrastructure;

namespace SchoolAdmission.Api.Domain;

/// <summary>
/// All admission rules live here. Every write path runs inside a single Postgres transaction and
/// takes a row lock (SELECT ... FOR UPDATE) before reading the numbers it decides on, so the
/// guarantees hold across threads AND across multiple backend processes sharing one database.
///
/// Seat accounting rule: a seat is "taken" by a hold row whose status is CONFIRMED, or HELD with
/// expires_at in the future. Expiry is therefore effective the instant the clock passes expires_at,
/// with no API call needed; the background sweeper only rewrites the stored status for tidiness.
/// All time comparisons use the database clock (clock_timestamp()) so multiple app servers with
/// slightly different clocks still agree.
/// </summary>
public sealed class AdmissionService(NpgsqlDataSource dataSource, AdmissionOptions options)
{
    static AdmissionService() => DefaultTypeMap.MatchNamesWithUnderscores = true;

    private const string ClassSummarySelect = """
        SELECT c.id,
               c.name,
               c.total_seats,
               COUNT(h.id) FILTER (WHERE h.status = 'HELD' AND h.expires_at > clock_timestamp())::int AS held_seats,
               COUNT(h.id) FILTER (WHERE h.status = 'CONFIRMED')::int                               AS confirmed_seats
        FROM classes c
        LEFT JOIN holds h ON h.class_id = c.id AND h.status IN ('HELD','CONFIRMED')
        """;

    // ---------- Classes ----------

    public async Task<ClassCreatedResponse> CreateClassAsync(CreateClassRequest? req, CancellationToken ct)
    {
        if (req is null)
            throw ApiException.BadRequest(ErrorCodes.ValidationFailed, "Request body is required.");

        var name = req.Name?.Trim();
        if (string.IsNullOrEmpty(name))
            throw ApiException.BadRequest(ErrorCodes.ValidationFailed, "Class name is required.");
        if (name.Length > 200)
            throw ApiException.BadRequest(ErrorCodes.ValidationFailed, "Class name must be at most 200 characters.");
        if (req.TotalSeats is null)
            throw ApiException.BadRequest(ErrorCodes.ValidationFailed, "totalSeats is required.");
        if (req.TotalSeats is < 1 or > 100_000)
            throw ApiException.BadRequest(ErrorCodes.ValidationFailed, "totalSeats must be a whole number between 1 and 100000.");

        var id = NewId("c");
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(
            "INSERT INTO classes (id, name, total_seats) VALUES (@id, @name, @seats)",
            new { id, name, seats = req.TotalSeats.Value }, cancellationToken: ct));

        return new ClassCreatedResponse(id, name, req.TotalSeats.Value);
    }

    public async Task<IReadOnlyList<ClassSummaryResponse>> ListClassesAsync(CancellationToken ct)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync<ClassRow>(new CommandDefinition(
            ClassSummarySelect + " GROUP BY c.id ORDER BY c.created_at, c.id", cancellationToken: ct));
        return rows.Select(ToSummary).ToList();
    }

    public async Task<ClassSummaryResponse> GetClassAsync(string classId, CancellationToken ct)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        var row = await conn.QuerySingleOrDefaultAsync<ClassRow>(new CommandDefinition(
            ClassSummarySelect + " WHERE c.id = @classId GROUP BY c.id", new { classId }, cancellationToken: ct));
        return row is null ? throw ClassNotFound(classId) : ToSummary(row);
    }

    // ---------- Holds ----------

    public async Task<HoldCreatedResponse> CreateHoldAsync(string classId, string studentId, CancellationToken ct)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);

        // 1. Serialize all hold attempts for this class (across processes) by locking the class row.
        var totalSeats = await conn.QuerySingleOrDefaultAsync<int?>(new CommandDefinition(
            "SELECT total_seats FROM classes WHERE id = @classId FOR UPDATE",
            new { classId }, tx, cancellationToken: ct));
        if (totalSeats is null) throw ClassNotFound(classId);

        // 2. Lapsed holds of this class become EXPIRED (frees their seat and their duplicate slot).
        await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE holds SET status = 'EXPIRED' WHERE class_id = @classId AND status = 'HELD' AND expires_at <= clock_timestamp()",
            new { classId }, tx, cancellationToken: ct));

        // 3. Duplicate rule: one active application or confirmed admission per student per class.
        var existing = await conn.QueryFirstOrDefaultAsync<string?>(new CommandDefinition(
            "SELECT status FROM holds WHERE class_id = @classId AND student_id = @studentId AND status IN ('HELD','CONFIRMED') LIMIT 1",
            new { classId, studentId }, tx, cancellationToken: ct));
        if (existing == HoldStatus.Confirmed)
            throw ApiException.Conflict(ErrorCodes.AlreadyAdmitted, "This student is already admitted to this class.");
        if (existing == HoldStatus.Held)
            throw ApiException.Conflict(ErrorCodes.DuplicateApplication, "This student already has an active application for this class.");

        // 4. Capacity rule: held + confirmed must never exceed total.
        var taken = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(*)::int FROM holds WHERE class_id = @classId AND status IN ('HELD','CONFIRMED')",
            new { classId }, tx, cancellationToken: ct));
        if (taken >= totalSeats.Value)
            throw ApiException.Conflict(ErrorCodes.SeatsFull, "No seats are available in this class.");

        // 5. Insert the hold. Expiry is computed on the DB clock.
        var holdId = NewId("h");
        DateTime expiresAt;
        try
        {
            expiresAt = await conn.ExecuteScalarAsync<DateTime>(new CommandDefinition(
                """
                INSERT INTO holds (id, class_id, student_id, status, expires_at)
                VALUES (@holdId, @classId, @studentId, 'HELD', clock_timestamp() + make_interval(secs => @duration))
                RETURNING expires_at
                """,
                new { holdId, classId, studentId, duration = (double)options.HoldDurationSeconds }, tx, cancellationToken: ct));
            await tx.CommitAsync(ct);
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            // Unreachable in practice thanks to the class lock, but the unique index is the final word.
            throw ApiException.Conflict(ErrorCodes.DuplicateApplication, "This student already has an active application for this class.");
        }

        return new HoldCreatedResponse(holdId, classId, studentId, HoldStatus.Held, ToUtc(expiresAt));
    }

    public async Task<HoldResponse> GetHoldAsync(string holdId, CancellationToken ct)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        var row = await conn.QuerySingleOrDefaultAsync<HoldRow>(new CommandDefinition(
            HoldSelect + " WHERE h.id = @holdId", new { holdId }, cancellationToken: ct));
        return row is null ? throw HoldNotFound(holdId) : ToHoldResponse(row);
    }

    public async Task<IReadOnlyList<MyHoldResponse>> ListStudentHoldsAsync(string studentId, CancellationToken ct)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync<HoldRow>(new CommandDefinition(
            HoldSelect + " WHERE h.student_id = @studentId ORDER BY h.created_at DESC, h.id",
            new { studentId }, cancellationToken: ct));
        return rows.Select(r => new MyHoldResponse(r.Id, r.ClassId, r.ClassName, EffectiveStatus(r), ToUtc(r.ExpiresAt), ToUtc(r.CreatedAt)))
                   .ToList();
    }

    public async Task<ConfirmResponse> ConfirmHoldAsync(string holdId, string studentId, CancellationToken ct)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);

        var hold = await LockHoldAsync(conn, tx, holdId, ct);
        EnsureOwner(hold, studentId);

        switch (hold.Status)
        {
            case HoldStatus.Confirmed:
                // Idempotent: repeated confirms succeed and change nothing.
                await tx.CommitAsync(ct);
                return new ConfirmResponse(holdId, HoldStatus.Confirmed);
            case HoldStatus.Cancelled:
                throw ApiException.Conflict(ErrorCodes.HoldCancelled, "This application was cancelled and can no longer be confirmed.");
            case HoldStatus.Expired:
                throw HoldExpired();
        }

        if (hold.IsLapsed)
        {
            await conn.ExecuteAsync(new CommandDefinition(
                "UPDATE holds SET status = 'EXPIRED' WHERE id = @holdId", new { holdId }, tx, cancellationToken: ct));
            await tx.CommitAsync(ct);
            throw HoldExpired();
        }

        // HELD -> CONFIRMED keeps held+confirmed constant, so capacity cannot be violated here.
        await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE holds SET status = 'CONFIRMED', confirmed_at = clock_timestamp() WHERE id = @holdId AND status = 'HELD'",
            new { holdId }, tx, cancellationToken: ct));
        await tx.CommitAsync(ct);
        return new ConfirmResponse(holdId, HoldStatus.Confirmed);
    }

    public async Task CancelHoldAsync(string holdId, string studentId, CancellationToken ct)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);

        var hold = await LockHoldAsync(conn, tx, holdId, ct);
        EnsureOwner(hold, studentId);

        switch (hold.Status)
        {
            case HoldStatus.Cancelled:
                await tx.CommitAsync(ct); // idempotent
                return;
            case HoldStatus.Confirmed:
                throw ApiException.Conflict(ErrorCodes.HoldAlreadyConfirmed, "Admission is already confirmed (fee paid) and cannot be cancelled here.");
            case HoldStatus.Expired:
                throw HoldExpired();
        }

        if (hold.IsLapsed)
        {
            await conn.ExecuteAsync(new CommandDefinition(
                "UPDATE holds SET status = 'EXPIRED' WHERE id = @holdId", new { holdId }, tx, cancellationToken: ct));
            await tx.CommitAsync(ct);
            throw HoldExpired();
        }

        await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE holds SET status = 'CANCELLED', cancelled_at = clock_timestamp() WHERE id = @holdId AND status = 'HELD'",
            new { holdId }, tx, cancellationToken: ct));
        await tx.CommitAsync(ct);
    }

    /// <summary>Persists EXPIRED status for lapsed holds. Purely cosmetic for counts (they already ignore lapsed holds).</summary>
    public async Task<int> ExpireLapsedHoldsAsync(CancellationToken ct)
    {
        await using var conn = await dataSource.OpenConnectionAsync(ct);
        return await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE holds SET status = 'EXPIRED' WHERE status = 'HELD' AND expires_at <= clock_timestamp()",
            cancellationToken: ct));
    }

    // ---------- helpers ----------

    private const string HoldSelect = """
        SELECT h.id, h.class_id, c.name AS class_name, h.student_id, h.status,
               h.created_at, h.expires_at, h.confirmed_at, h.cancelled_at,
               (h.status = 'HELD' AND h.expires_at <= clock_timestamp()) AS is_lapsed
        FROM holds h
        JOIN classes c ON c.id = h.class_id
        """;

    private static async Task<HoldRow> LockHoldAsync(NpgsqlConnection conn, NpgsqlTransaction tx, string holdId, CancellationToken ct)
    {
        var row = await conn.QuerySingleOrDefaultAsync<HoldRow>(new CommandDefinition(
            HoldSelect + " WHERE h.id = @holdId FOR UPDATE OF h", new { holdId }, tx, cancellationToken: ct));
        return row ?? throw HoldNotFound(holdId);
    }

    private static void EnsureOwner(HoldRow hold, string studentId)
    {
        if (!string.Equals(hold.StudentId, studentId, StringComparison.Ordinal))
            throw ApiException.Forbidden(ErrorCodes.NotYourHold, "This application belongs to a different student.");
    }

    private static string EffectiveStatus(HoldRow r) => r.IsLapsed ? HoldStatus.Expired : r.Status;

    private static HoldResponse ToHoldResponse(HoldRow r) => new(
        r.Id, r.ClassId, r.ClassName, r.StudentId, EffectiveStatus(r),
        ToUtc(r.ExpiresAt), ToUtc(r.CreatedAt),
        r.ConfirmedAt is null ? null : ToUtc(r.ConfirmedAt.Value),
        r.CancelledAt is null ? null : ToUtc(r.CancelledAt.Value));

    private static ClassSummaryResponse ToSummary(ClassRow r) => new(
        r.Id, r.Name, r.TotalSeats, r.HeldSeats, r.ConfirmedSeats,
        Math.Max(0, r.TotalSeats - r.HeldSeats - r.ConfirmedSeats));

    private static DateTime ToUtc(DateTime d) => DateTime.SpecifyKind(d.Kind == DateTimeKind.Local ? d.ToUniversalTime() : d, DateTimeKind.Utc);

    private static string NewId(string prefix) => $"{prefix}_{Guid.NewGuid():N}";

    private static ApiException ClassNotFound(string id) => ApiException.NotFound(ErrorCodes.ClassNotFound, $"Class '{id}' was not found.");
    private static ApiException HoldNotFound(string id) => ApiException.NotFound(ErrorCodes.HoldNotFound, $"Application '{id}' was not found.");
    private static ApiException HoldExpired() => ApiException.Conflict(ErrorCodes.HoldExpired, "This application has expired. The seat was released.");

    private sealed class ClassRow
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public int TotalSeats { get; set; }
        public int HeldSeats { get; set; }
        public int ConfirmedSeats { get; set; }
    }

    private sealed class HoldRow
    {
        public string Id { get; set; } = "";
        public string ClassId { get; set; } = "";
        public string ClassName { get; set; } = "";
        public string StudentId { get; set; } = "";
        public string Status { get; set; } = "";
        public DateTime CreatedAt { get; set; }
        public DateTime ExpiresAt { get; set; }
        public DateTime? ConfirmedAt { get; set; }
        public DateTime? CancelledAt { get; set; }
        public bool IsLapsed { get; set; }
    }
}
