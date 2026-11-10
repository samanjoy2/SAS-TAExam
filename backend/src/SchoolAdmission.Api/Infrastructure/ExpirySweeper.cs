using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Api.Infrastructure;

/// <summary>
/// Periodically rewrites lapsed HELD rows to EXPIRED. Seat counts never depend on this job
/// (they compare expires_at with the DB clock directly), so if it is late or several
/// processes run it at once, nothing breaks: the UPDATE is idempotent.
/// </summary>
public sealed class ExpirySweeper(AdmissionService service, AdmissionOptions options, ILogger<ExpirySweeper> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(options.ExpirySweepSeconds));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                var n = await service.ExpireLapsedHoldsAsync(stoppingToken);
                if (n > 0) logger.LogInformation("Expired {Count} lapsed hold(s)", n);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning("Expiry sweep failed: {Message}", ex.Message);
            }
        }
    }
}
