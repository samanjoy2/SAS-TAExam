using System.Text.Json;
using Npgsql;
using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Api.Infrastructure;

/// <summary>Turns every failure into a JSON body: { "error": CODE, "message": "..." }.</summary>
public sealed class ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (ApiException ex)
        {
            await WriteAsync(context, ex.StatusCode, ex.Code, ex.Message);
        }
        catch (BadHttpRequestException ex)
        {
            // Malformed JSON / wrong JSON types (e.g. "totalSeats": "abc") end up here.
            var isJson = ex.InnerException is JsonException;
            await WriteAsync(context, StatusCodes.Status400BadRequest,
                isJson ? ErrorCodes.InvalidJson : ErrorCodes.ValidationFailed,
                isJson ? "Request body is not valid JSON or has fields of the wrong type." : ex.Message);
        }
        // SocketException: while the DB container restarts, even resolving its hostname fails, and Npgsql
        // lets that surface unwrapped. Found by restarting Postgres under load.
        catch (Exception ex) when ((ex is NpgsqlException or TimeoutException or System.Net.Sockets.SocketException)
                                   && !context.RequestAborted.IsCancellationRequested)
        {
            logger.LogWarning("Database unavailable: {Type}: {Message}", ex.GetType().Name, ex.Message);
            await WriteAsync(context, StatusCodes.Status503ServiceUnavailable, ErrorCodes.DatabaseUnavailable,
                "The database is temporarily unavailable. Please try again shortly.");
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // Client went away; nothing to write.
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled error");
            await WriteAsync(context, StatusCodes.Status500InternalServerError, ErrorCodes.InternalError,
                "An unexpected error occurred.");
        }
    }

    private static async Task WriteAsync(HttpContext context, int status, string code, string message)
    {
        if (context.Response.HasStarted) return;
        context.Response.Clear();
        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new ErrorResponse(code, message));
    }
}
