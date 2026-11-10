using System.Text.Json;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.Options;
using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Api;

public static class Endpoints
{
    public static void MapAdmissionEndpoints(this WebApplication app)
    {
        // 1. Create class (each shift is its own class)
        // The body is parsed by hand so a missing or non-JSON Content-Type still works (clients and test
        // tools often omit it); minimal-API binding would otherwise skip the endpoint entirely.
        app.MapPost("/classes", async (HttpRequest req, AdmissionService svc, CancellationToken ct) =>
        {
            var body = await ReadJsonAsync<CreateClassRequest>(req, ct);
            var created = await svc.CreateClassAsync(body, ct);
            return Results.Created($"/classes/{created.Id}", created);
        });

        // 2. List classes with seat counts
        app.MapGet("/classes", async (AdmissionService svc, CancellationToken ct) =>
            Results.Ok(await svc.ListClassesAsync(ct)));

        // 3. One class with seat counts
        app.MapGet("/classes/{classId}", async (string classId, AdmissionService svc, CancellationToken ct) =>
            Results.Ok(await svc.GetClassAsync(classId, ct)));

        // 4. Apply = hold a seat
        app.MapPost("/classes/{classId}/holds", async (string classId, HttpRequest req, AdmissionService svc, CancellationToken ct) =>
        {
            var studentId = StudentId.Require(req);
            var hold = await svc.CreateHoldAsync(classId, studentId, ct);
            return Results.Created($"/holds/{hold.HoldId}", hold);
        });

        // 5. Hold status
        app.MapGet("/holds/{holdId}", async (string holdId, AdmissionService svc, CancellationToken ct) =>
            Results.Ok(await svc.GetHoldAsync(holdId, ct)));

        // 6. Pay fee -> confirm (idempotent)
        app.MapPost("/holds/{holdId}/confirm", async (string holdId, HttpRequest req, AdmissionService svc, CancellationToken ct) =>
        {
            var studentId = StudentId.Require(req);
            return Results.Ok(await svc.ConfirmHoldAsync(holdId, studentId, ct));
        });

        // 7. Cancel application
        app.MapDelete("/holds/{holdId}", async (string holdId, HttpRequest req, AdmissionService svc, CancellationToken ct) =>
        {
            var studentId = StudentId.Require(req);
            await svc.CancelHoldAsync(holdId, studentId, ct);
            return Results.NoContent();
        });

        // 8. All applications of the calling student
        app.MapGet("/me/holds", async (HttpRequest req, AdmissionService svc, CancellationToken ct) =>
        {
            var studentId = StudentId.Require(req);
            return Results.Ok(await svc.ListStudentHoldsAsync(studentId, ct));
        });
    }

    private static async Task<T?> ReadJsonAsync<T>(HttpRequest req, CancellationToken ct) where T : class
    {
        var json = req.HttpContext.RequestServices.GetRequiredService<IOptions<JsonOptions>>().Value.SerializerOptions;
        using var reader = new StreamReader(req.Body);
        var text = await reader.ReadToEndAsync(ct);
        if (string.IsNullOrWhiteSpace(text))
            throw ApiException.BadRequest(ErrorCodes.ValidationFailed, "Request body is required.");
        try
        {
            return JsonSerializer.Deserialize<T>(text, json);
        }
        catch (JsonException)
        {
            throw ApiException.BadRequest(ErrorCodes.InvalidJson, "Request body is not valid JSON or has fields of the wrong type.");
        }
    }
}
