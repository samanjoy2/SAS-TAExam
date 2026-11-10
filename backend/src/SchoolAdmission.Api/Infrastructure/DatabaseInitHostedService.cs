using Npgsql;

namespace SchoolAdmission.Api.Infrastructure;

/// <summary>Runs schema creation before the HTTP server starts accepting requests.</summary>
public sealed class DatabaseInitHostedService(NpgsqlDataSource dataSource, ILogger<DatabaseInitHostedService> logger)
    : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken) =>
        DatabaseInitializer.InitializeAsync(dataSource, logger, cancellationToken);

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
