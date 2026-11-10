using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Api;

public static class Endpoints
{
    public static void MapAdmissionEndpoints(this WebApplication app)
    {
        // 1. Create class (each shift is its own class)
        app.MapPost("/classes", async (CreateClassRequest? body, AdmissionService svc, CancellationToken ct) =>
        {
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
}
