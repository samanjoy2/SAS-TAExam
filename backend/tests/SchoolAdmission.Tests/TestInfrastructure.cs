using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Npgsql;
using Testcontainers.PostgreSql;

namespace SchoolAdmission.Tests;

/// <summary>
/// Provides one PostgreSQL database for the whole test run.
/// - If TEST_DB_CONNECTION_STRING is set (e.g. inside docker compose), that server is used and a
///   dedicated "admission_test" database is created on it.
/// - Otherwise a throwaway postgres container is started with Testcontainers (needs Docker).
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private PostgreSqlContainer? _container;
    public string ConnectionString { get; private set; } = "";

    public async Task InitializeAsync()
    {
        var external = Environment.GetEnvironmentVariable("TEST_DB_CONNECTION_STRING");
        if (!string.IsNullOrWhiteSpace(external))
        {
            ConnectionString = await EnsureDatabaseAsync(external, "admission_test");
            return;
        }

        _container = new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();
        await _container.StartAsync();
        ConnectionString = _container.GetConnectionString();
    }

    public async Task DisposeAsync()
    {
        if (_container is not null) await _container.DisposeAsync();
    }

    private static async Task<string> EnsureDatabaseAsync(string serverConnectionString, string dbName)
    {
        var admin = new NpgsqlConnectionStringBuilder(serverConnectionString) { Database = "postgres" };
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                await using var conn = new NpgsqlConnection(admin.ConnectionString);
                await conn.OpenAsync();
                await using var check = new NpgsqlCommand("SELECT 1 FROM pg_database WHERE datname = @n", conn);
                check.Parameters.AddWithValue("n", dbName);
                if (await check.ExecuteScalarAsync() is null)
                {
                    await using var create = new NpgsqlCommand($"CREATE DATABASE \"{dbName}\"", conn);
                    await create.ExecuteNonQueryAsync();
                }
                break;
            }
            catch (NpgsqlException) when (attempt < 30)
            {
                await Task.Delay(1000);
            }
        }
        return new NpgsqlConnectionStringBuilder(serverConnectionString) { Database = dbName }.ConnectionString;
    }
}

[CollectionDefinition(Name)]
public sealed class DatabaseCollection : ICollectionFixture<PostgresFixture>
{
    public const string Name = "database";
}

/// <summary>An in-memory instance of the real API wired to the test database.</summary>
public sealed class ApiFactory(string connectionString, int holdDurationSeconds = 600) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, cfg) => cfg.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["DB_CONNECTION_STRING"] = connectionString,
            ["ConnectionStrings:Default"] = connectionString,
            ["HOLD_DURATION_SECONDS"] = holdDurationSeconds.ToString(),
            ["EXPIRY_SWEEP_SECONDS"] = "1",
        }));
    }
}

public static class Api
{
    public static int StudentSeq = 0;

    /// <summary>Unique, valid 17-digit student id.</summary>
    public static string NewStudentId() =>
        "2015" + Interlocked.Increment(ref StudentSeq).ToString().PadLeft(4, '0') + Random.Shared.NextInt64(0, 1_000_000_000).ToString("D9");

    public static async Task<string> CreateClassAsync(HttpClient client, int seats, string name = "Class 6 - Morning Shift")
    {
        var res = await client.PostAsJsonAsync("/classes", new { name, totalSeats = seats });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<ClassDto>();
        return body!.Id;
    }

    public static Task<HttpResponseMessage> HoldAsync(HttpClient client, string classId, string studentId) =>
        Send(client, HttpMethod.Post, $"/classes/{classId}/holds", studentId);

    public static Task<HttpResponseMessage> ConfirmAsync(HttpClient client, string holdId, string studentId) =>
        Send(client, HttpMethod.Post, $"/holds/{holdId}/confirm", studentId);

    public static Task<HttpResponseMessage> CancelAsync(HttpClient client, string holdId, string studentId) =>
        Send(client, HttpMethod.Delete, $"/holds/{holdId}", studentId);

    public static async Task<ClassDto> GetClassAsync(HttpClient client, string classId) =>
        (await client.GetFromJsonAsync<ClassDto>($"/classes/{classId}"))!;

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string url, string studentId)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Add("X-Student-Id", studentId);
        return client.SendAsync(req);
    }
}

public sealed record ClassDto(string Id, string Name, int TotalSeats, int HeldSeats, int ConfirmedSeats, int AvailableSeats);
public sealed record HoldDto(string HoldId, string ClassId, string StudentId, string Status, DateTime ExpiresAt);
public sealed record ErrorDto(string Error, string Message);
