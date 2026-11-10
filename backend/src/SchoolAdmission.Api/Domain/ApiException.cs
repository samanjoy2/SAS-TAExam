namespace SchoolAdmission.Api.Domain;

/// <summary>
/// Business-rule failure that maps directly to an HTTP status + error code.
/// </summary>
public sealed class ApiException(int statusCode, string code, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string Code { get; } = code;

    public static ApiException BadRequest(string code, string message) => new(StatusCodes.Status400BadRequest, code, message);
    public static ApiException Forbidden(string code, string message) => new(StatusCodes.Status403Forbidden, code, message);
    public static ApiException NotFound(string code, string message) => new(StatusCodes.Status404NotFound, code, message);
    public static ApiException Conflict(string code, string message) => new(StatusCodes.Status409Conflict, code, message);
}

public static class ErrorCodes
{
    public const string ValidationFailed = "VALIDATION_FAILED";
    public const string InvalidJson = "INVALID_JSON";
    public const string MissingStudentId = "MISSING_STUDENT_ID";
    public const string InvalidStudentId = "INVALID_STUDENT_ID";
    public const string ClassNotFound = "CLASS_NOT_FOUND";
    public const string HoldNotFound = "HOLD_NOT_FOUND";
    public const string SeatsFull = "SEATS_FULL";
    public const string DuplicateApplication = "DUPLICATE_APPLICATION";
    public const string AlreadyAdmitted = "ALREADY_ADMITTED";
    public const string HoldExpired = "HOLD_EXPIRED";
    public const string HoldCancelled = "HOLD_CANCELLED";
    public const string HoldAlreadyConfirmed = "HOLD_ALREADY_CONFIRMED";
    public const string NotYourHold = "NOT_YOUR_HOLD";
    public const string DatabaseUnavailable = "DATABASE_UNAVAILABLE";
    public const string InternalError = "INTERNAL_ERROR";
    public const string NotFound = "NOT_FOUND";
    public const string MethodNotAllowed = "METHOD_NOT_ALLOWED";
}
