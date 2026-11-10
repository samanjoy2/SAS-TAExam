using System.Text.RegularExpressions;

namespace SchoolAdmission.Api.Domain;

public static partial class StudentId
{
    public const string HeaderName = "X-Student-Id";

    [GeneratedRegex("^[0-9]{17}$")]
    private static partial Regex Pattern();

    /// <summary>Reads and validates the X-Student-Id header (17-digit birth registration number).</summary>
    public static string Require(HttpRequest request)
    {
        if (!request.Headers.TryGetValue(HeaderName, out var values) || string.IsNullOrWhiteSpace(values.ToString()))
            throw ApiException.BadRequest(ErrorCodes.MissingStudentId,
                $"The {HeaderName} header is required (17-digit birth registration number).");

        var raw = values.ToString().Trim();
        if (!Pattern().IsMatch(raw))
            throw ApiException.BadRequest(ErrorCodes.InvalidStudentId,
                $"{HeaderName} must be exactly 17 digits (birth registration number).");

        return raw;
    }
}
