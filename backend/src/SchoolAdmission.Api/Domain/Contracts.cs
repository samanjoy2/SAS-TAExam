namespace SchoolAdmission.Api.Domain;

public static class HoldStatus
{
    public const string Held = "HELD";
    public const string Confirmed = "CONFIRMED";
    public const string Expired = "EXPIRED";
    public const string Cancelled = "CANCELLED";
}

// ---- Requests ----

public sealed record CreateClassRequest(string? Name, int? TotalSeats);

// ---- Responses (field names follow the API contract exactly; extra fields are allowed) ----

public sealed record ClassCreatedResponse(string Id, string Name, int TotalSeats);

public sealed record ClassSummaryResponse(
    string Id,
    string Name,
    int TotalSeats,
    int HeldSeats,
    int ConfirmedSeats,
    int AvailableSeats);

public sealed record HoldCreatedResponse(
    string HoldId,
    string ClassId,
    string StudentId,
    string Status,
    DateTime ExpiresAt);

public sealed record HoldResponse(
    string HoldId,
    string ClassId,
    string ClassName,
    string StudentId,
    string Status,
    DateTime ExpiresAt,
    DateTime CreatedAt,
    DateTime? ConfirmedAt,
    DateTime? CancelledAt);

public sealed record ConfirmResponse(string HoldId, string Status);

public sealed record MyHoldResponse(
    string HoldId,
    string ClassId,
    string ClassName,
    string Status,
    DateTime ExpiresAt,
    DateTime CreatedAt);

/// <summary>Uniform error body: a stable machine code plus a human readable message.</summary>
public sealed record ErrorResponse(string Error, string Message);
