using System.Net;
using System.Net.Http.Json;

namespace SchoolAdmission.Tests;

[Collection(DatabaseCollection.Name)]
public sealed class AdmissionRulesTests(PostgresFixture db)
{
    [Fact]
    public async Task Create_class_returns_contract_fields()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();

        var res = await client.PostAsJsonAsync("/classes", new { name = "Class 6 - Day Shift", totalSeats = 120 });

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<ClassDto>();
        Assert.False(string.IsNullOrEmpty(body!.Id));
        Assert.Equal("Class 6 - Day Shift", body.Name);
        Assert.Equal(120, body.TotalSeats);

        var listed = await client.GetFromJsonAsync<List<ClassDto>>("/classes");
        var mine = Assert.Single(listed!, c => c.Id == body.Id);
        Assert.Equal(120, mine.AvailableSeats);
    }

    [Theory]
    [InlineData("{\"name\":\"\",\"totalSeats\":10}")]
    [InlineData("{\"name\":\"X\",\"totalSeats\":0}")]
    [InlineData("{\"name\":\"X\",\"totalSeats\":-3}")]
    [InlineData("{\"name\":\"X\",\"totalSeats\":\"ten\"}")]
    [InlineData("{\"name\":\"X\"}")]
    [InlineData("not json")]
    public async Task Invalid_class_input_is_rejected_with_400(string json)
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();

        var res = await client.PostAsync("/classes", new StringContent(json, System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        var err = await res.Content.ReadFromJsonAsync<ErrorDto>();
        Assert.False(string.IsNullOrEmpty(err!.Message));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("1234")]
    [InlineData("2015269123456789X")]
    [InlineData("201526912345678901")]
    public async Task Invalid_or_missing_student_id_is_rejected(string? studentId)
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();
        var classId = await Api.CreateClassAsync(client, 3);

        var req = new HttpRequestMessage(HttpMethod.Post, $"/classes/{classId}/holds");
        if (studentId is not null) req.Headers.Add("X-Student-Id", studentId);
        var res = await client.SendAsync(req);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(0, (await Api.GetClassAsync(client, classId)).HeldSeats);
    }

    [Fact]
    public async Task Hold_on_unknown_class_returns_404()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var res = await Api.HoldAsync(factory.CreateClient(), "c_does_not_exist", Api.NewStudentId());
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Full_class_returns_409_with_seats_full_code()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();
        var classId = await Api.CreateClassAsync(client, 1);
        Assert.Equal(HttpStatusCode.Created, (await Api.HoldAsync(client, classId, Api.NewStudentId())).StatusCode);

        var res = await Api.HoldAsync(client, classId, Api.NewStudentId());

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("SEATS_FULL", (await res.Content.ReadFromJsonAsync<ErrorDto>())!.Error);
    }

    [Fact]
    public async Task Confirmed_student_cannot_apply_again_to_same_class_but_can_to_another()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();
        var morning = await Api.CreateClassAsync(client, 5, "Class 6 - Morning Shift");
        var day = await Api.CreateClassAsync(client, 5, "Class 6 - Day Shift");
        var student = Api.NewStudentId();

        var hold = await (await Api.HoldAsync(client, morning, student)).Content.ReadFromJsonAsync<HoldDto>();
        Assert.Equal(HttpStatusCode.OK, (await Api.ConfirmAsync(client, hold!.HoldId, student)).StatusCode);

        var again = await Api.HoldAsync(client, morning, student);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("ALREADY_ADMITTED", (await again.Content.ReadFromJsonAsync<ErrorDto>())!.Error);

        Assert.Equal(HttpStatusCode.Created, (await Api.HoldAsync(client, day, student)).StatusCode);
    }

    [Fact]
    public async Task Only_the_owner_can_confirm_or_cancel()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();
        var classId = await Api.CreateClassAsync(client, 2);
        var owner = Api.NewStudentId();
        var hold = await (await Api.HoldAsync(client, classId, owner)).Content.ReadFromJsonAsync<HoldDto>();
        var stranger = Api.NewStudentId();

        Assert.Equal(HttpStatusCode.Forbidden, (await Api.ConfirmAsync(client, hold!.HoldId, stranger)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Api.CancelAsync(client, hold.HoldId, stranger)).StatusCode);
        Assert.Equal(0, (await Api.GetClassAsync(client, classId)).ConfirmedSeats);
    }

    [Fact]
    public async Task Cancel_releases_the_seat_and_cannot_then_be_confirmed()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();
        var classId = await Api.CreateClassAsync(client, 1);
        var student = Api.NewStudentId();
        var hold = await (await Api.HoldAsync(client, classId, student)).Content.ReadFromJsonAsync<HoldDto>();

        Assert.Equal(HttpStatusCode.NoContent, (await Api.CancelAsync(client, hold!.HoldId, student)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Api.CancelAsync(client, hold.HoldId, student)).StatusCode); // idempotent

        var status = await client.GetFromJsonAsync<HoldDto>($"/holds/{hold.HoldId}");
        Assert.Equal("CANCELLED", status!.Status);
        Assert.Equal(1, (await Api.GetClassAsync(client, classId)).AvailableSeats);
        Assert.Equal(HttpStatusCode.Conflict, (await Api.ConfirmAsync(client, hold.HoldId, student)).StatusCode);

        // The same student may re-apply after cancelling.
        Assert.Equal(HttpStatusCode.Created, (await Api.HoldAsync(client, classId, student)).StatusCode);
    }

    [Fact]
    public async Task Hold_expires_automatically_and_frees_the_seat()
    {
        await using var factory = new ApiFactory(db.ConnectionString, holdDurationSeconds: 2);
        var client = factory.CreateClient();
        var classId = await Api.CreateClassAsync(client, 1);
        var student = Api.NewStudentId();
        var res = await Api.HoldAsync(client, classId, student);
        var hold = await res.Content.ReadFromJsonAsync<HoldDto>();
        Assert.Equal("HELD", hold!.Status);
        Assert.InRange((hold.ExpiresAt - DateTime.UtcNow).TotalSeconds, -5, 10);
        Assert.Equal(0, (await Api.GetClassAsync(client, classId)).AvailableSeats);

        await Task.Delay(TimeSpan.FromSeconds(3));

        // No API call was needed to release the seat.
        var cls = await Api.GetClassAsync(client, classId);
        Assert.Equal(0, cls.HeldSeats);
        Assert.Equal(1, cls.AvailableSeats);
        var status = await client.GetFromJsonAsync<HoldDto>($"/holds/{hold.HoldId}");
        Assert.Equal("EXPIRED", status!.Status);

        var confirm = await Api.ConfirmAsync(client, hold.HoldId, student);
        Assert.Equal(HttpStatusCode.Conflict, confirm.StatusCode);
        Assert.Equal("HOLD_EXPIRED", (await confirm.Content.ReadFromJsonAsync<ErrorDto>())!.Error);
        Assert.Equal(0, (await Api.GetClassAsync(client, classId)).ConfirmedSeats);

        // Someone else can now take the seat.
        Assert.Equal(HttpStatusCode.Created, (await Api.HoldAsync(client, classId, Api.NewStudentId())).StatusCode);
    }

    [Fact]
    public async Task My_holds_lists_only_the_callers_applications()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();
        var a = await Api.CreateClassAsync(client, 3, "Class 7 - Morning Shift");
        var b = await Api.CreateClassAsync(client, 3, "Class 7 - Day Shift");
        var me = Api.NewStudentId();
        await Api.HoldAsync(client, a, me);
        await Api.HoldAsync(client, b, me);
        await Api.HoldAsync(client, a, Api.NewStudentId());

        var req = new HttpRequestMessage(HttpMethod.Get, "/me/holds");
        req.Headers.Add("X-Student-Id", me);
        var res = await client.SendAsync(req);
        var list = await res.Content.ReadFromJsonAsync<List<MyHoldDto>>();

        Assert.Equal(2, list!.Count);
        Assert.Contains(list, h => h.ClassId == a && h.ClassName == "Class 7 - Morning Shift" && h.Status == "HELD");
        Assert.Contains(list, h => h.ClassId == b && h.ClassName == "Class 7 - Day Shift");
    }

    private sealed record MyHoldDto(string HoldId, string ClassId, string ClassName, string Status, DateTime ExpiresAt);
}
