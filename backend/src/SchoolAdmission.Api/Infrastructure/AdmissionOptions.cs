namespace SchoolAdmission.Api.Infrastructure;

/// <summary>
/// Runtime settings. Read from IConfiguration (env vars override appsettings.json).
/// </summary>
public sealed class AdmissionOptions
{
    public const int DefaultHoldDurationSeconds = 600;

    public required string ConnectionString { get; init; }
    public int HoldDurationSeconds { get; init; } = DefaultHoldDurationSeconds;
    public int ExpirySweepSeconds { get; init; } = 5;

    public static AdmissionOptions FromConfiguration(IConfiguration config)
    {
        // DATABASE_URL-style override is convenient in containers; ConnectionStrings__Default is the .NET convention.
        var cs = config["DB_CONNECTION_STRING"];
        if (string.IsNullOrWhiteSpace(cs)) cs = config.GetConnectionString("Default");
        if (string.IsNullOrWhiteSpace(cs))
            throw new InvalidOperationException("No database connection string configured (ConnectionStrings__Default or DB_CONNECTION_STRING).");

        var hold = ParsePositive(config["HOLD_DURATION_SECONDS"], DefaultHoldDurationSeconds);
        var sweep = ParsePositive(config["EXPIRY_SWEEP_SECONDS"], 5);

        return new AdmissionOptions { ConnectionString = cs, HoldDurationSeconds = hold, ExpirySweepSeconds = sweep };
    }

    private static int ParsePositive(string? raw, int fallback) =>
        int.TryParse(raw, out var v) && v > 0 ? v : fallback;
}
