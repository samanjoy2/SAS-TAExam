using System.Net;
using System.Net.Http.Json;
using System.Text;

namespace SchoolAdmission.Tests;

/// <summary>Regression tests for issues found by stress / edge-case testing, plus targeted races.</summary>
[Collection(DatabaseCollection.Name)]
public sealed class RobustnessTests(PostgresFixture db)
{
    [Theory]
    [InlineData(null)]           // no Content-Type header at all
    [InlineData("text/plain")]
    [InlineData("application/json; charset=utf-8")]
    public async Task Create_class_accepts_json_body_regardless_of_content_type(string? contentType)
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();
        var content = new ByteArrayContent(Encoding.UTF8.GetBytes("{\"name\":\"Class 8 - Day Shift\",\"totalSeats\":40}"));
        if (contentType is not null) content.Headers.TryAddWithoutValidation("Content-Type", contentType);

        var res = await client.PostAsync("/classes", content);

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        Assert.Equal(40, (await res.Content.ReadFromJsonAsync<ClassDto>())!.TotalSeats);
    }

    [Fact]
    public async Task Empty_body_is_a_400_not_a_404()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var res = await factory.CreateClient().PostAsync("/classes", new ByteArrayContent([]));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Wrong_method_is_405_with_json_body_and_unknown_route_is_404()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();

        var put = await client.PutAsync("/classes", new StringContent("{}"));
        Assert.Equal(HttpStatusCode.MethodNotAllowed, put.StatusCode);
        Assert.Equal("METHOD_NOT_ALLOWED", (await put.Content.ReadFromJsonAsync<ErrorDto>())!.Error);

        var missing = await client.GetAsync("/nope");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal("NOT_FOUND", (await missing.Content.ReadFromJsonAsync<ErrorDto>())!.Error);
    }

    [Fact]
    public async Task Bengali_class_name_round_trips()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();
        const string name = "ষষ্ঠ শ্রেণি - প্রভাতী শাখা";
        var id = await Api.CreateClassAsync(client, 3, name);
        Assert.Equal(name, (await Api.GetClassAsync(client, id)).Name);
    }

    /// <summary>Confirm and cancel arriving together: exactly one wins and seat counts stay consistent.</summary>
    [Fact]
    public async Task Confirm_and_cancel_racing_on_the_same_hold_have_exactly_one_winner()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();
        const int holds = 25;
        var classId = await Api.CreateClassAsync(client, holds);

        var students = Enumerable.Range(0, holds).Select(_ => Api.NewStudentId()).ToList();
        var created = await Task.WhenAll(students.Select(s => Api.HoldAsync(client, classId, s)));
        var holdIds = await Task.WhenAll(created.Select(async r => (await r.Content.ReadFromJsonAsync<HoldDto>())!.HoldId));

        var races = await Task.WhenAll(holdIds.Select(async (id, i) =>
        {
            var confirm = Api.ConfirmAsync(client, id, students[i]);
            var cancel = Api.CancelAsync(client, id, students[i]);
            return (Confirm: (await confirm).StatusCode, Cancel: (await cancel).StatusCode, Id: id);
        }));

        var confirmedWins = 0;
        foreach (var (confirm, cancel, id) in races)
        {
            var final = (await client.GetFromJsonAsync<HoldDto>($"/holds/{id}"))!.Status;
            if (confirm == HttpStatusCode.OK)
            {
                Assert.Equal(HttpStatusCode.Conflict, cancel); // cannot cancel a confirmed admission
                Assert.Equal("CONFIRMED", final);
                confirmedWins++;
            }
            else
            {
                Assert.Equal(HttpStatusCode.Conflict, confirm);
                Assert.Equal(HttpStatusCode.NoContent, cancel);
                Assert.Equal("CANCELLED", final);
            }
        }

        var cls = await Api.GetClassAsync(client, classId);
        Assert.Equal(confirmedWins, cls.ConfirmedSeats);
        Assert.Equal(0, cls.HeldSeats);
        Assert.Equal(holds - confirmedWins, cls.AvailableSeats);
    }

    /// <summary>Confirms hammering a hold right at its deadline never confirm it after expiry.</summary>
    [Fact]
    public async Task Confirms_at_the_expiry_boundary_never_confirm_a_lapsed_hold()
    {
        await using var factory = new ApiFactory(db.ConnectionString, holdDurationSeconds: 1);
        var client = factory.CreateClient();
        var classId = await Api.CreateClassAsync(client, 10);
        var pairs = new List<(string Student, HoldDto Hold)>();
        for (var i = 0; i < 10; i++)
        {
            var s = Api.NewStudentId();
            pairs.Add((s, (await (await Api.HoldAsync(client, classId, s)).Content.ReadFromJsonAsync<HoldDto>())!));
        }

        // Keep firing confirms from ~0.8s to ~1.3s after creation, straddling the 1s deadline.
        await Task.Delay(800);
        var until = DateTime.UtcNow.AddMilliseconds(500);
        var attempts = new List<Task<HttpResponseMessage>>();
        while (DateTime.UtcNow < until)
        {
            attempts.AddRange(pairs.Select(p => Api.ConfirmAsync(client, p.Hold.HoldId, p.Student)));
            await Task.Delay(25);
        }
        var results = await Task.WhenAll(attempts);
        Assert.All(results, r => Assert.Contains(r.StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict }));

        var confirmed = 0;
        foreach (var (_, hold) in pairs)
        {
            var detail = await client.GetFromJsonAsync<HoldDetailDto>($"/holds/{hold.HoldId}");
            Assert.Contains(detail!.Status, new[] { "CONFIRMED", "EXPIRED" });
            if (detail.Status == "CONFIRMED")
            {
                confirmed++;
                Assert.NotNull(detail.ConfirmedAt);
                Assert.True(detail.ConfirmedAt <= detail.ExpiresAt, "confirmed after its deadline");
            }
        }
        var cls = await Api.GetClassAsync(client, classId);
        Assert.Equal(confirmed, cls.ConfirmedSeats);
        Assert.Equal(0, cls.HeldSeats);
    }

    private sealed record HoldDetailDto(string HoldId, string Status, DateTime ExpiresAt, DateTime? ConfirmedAt);
}
