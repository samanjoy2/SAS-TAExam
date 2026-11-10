using System.Net;
using System.Net.Http.Json;

namespace SchoolAdmission.Tests;

[Collection(DatabaseCollection.Name)]
public sealed class ConcurrencyTests(PostgresFixture db)
{
    [Fact]
    public async Task Many_simultaneous_applications_never_exceed_total_seats()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();
        const int seats = 10;
        const int applicants = 200;
        var classId = await Api.CreateClassAsync(client, seats);

        using var gate = new SemaphoreSlim(0);
        var tasks = Enumerable.Range(0, applicants).Select(async _ =>
        {
            var student = Api.NewStudentId();
            await gate.WaitAsync();
            var res = await Api.HoldAsync(client, classId, student);
            return res.StatusCode;
        }).ToList();
        gate.Release(applicants); // fire all at once

        var results = await Task.WhenAll(tasks);

        Assert.Equal(seats, results.Count(s => s == HttpStatusCode.Created));
        Assert.True(applicants - seats == results.Count(s => s == HttpStatusCode.Conflict),
            "Unexpected statuses: " + string.Join(", ", results.GroupBy(s => s).Select(g => $"{(int)g.Key}x{g.Count()}")));

        var cls = await Api.GetClassAsync(client, classId);
        Assert.Equal(seats, cls.HeldSeats);
        Assert.Equal(0, cls.ConfirmedSeats);
        Assert.Equal(0, cls.AvailableSeats);
        Assert.True(cls.HeldSeats + cls.ConfirmedSeats <= cls.TotalSeats);
    }

    [Fact]
    public async Task Same_student_applying_concurrently_gets_exactly_one_hold()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();
        var classId = await Api.CreateClassAsync(client, 50);
        var student = Api.NewStudentId();

        var results = await Task.WhenAll(Enumerable.Range(0, 30).Select(_ => Api.HoldAsync(client, classId, student)));

        Assert.Equal(1, results.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.All(results.Where(r => r.StatusCode != HttpStatusCode.Created),
            r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        Assert.Equal(1, (await Api.GetClassAsync(client, classId)).HeldSeats);
    }

    [Fact]
    public async Task Concurrent_confirms_of_one_hold_count_once()
    {
        await using var factory = new ApiFactory(db.ConnectionString);
        var client = factory.CreateClient();
        var classId = await Api.CreateClassAsync(client, 5);
        var student = Api.NewStudentId();
        var hold = await (await Api.HoldAsync(client, classId, student)).Content.ReadFromJsonAsync<HoldDto>();

        var results = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => Api.ConfirmAsync(client, hold!.HoldId, student)));

        Assert.All(results, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        var cls = await Api.GetClassAsync(client, classId);
        Assert.Equal(1, cls.ConfirmedSeats);
        Assert.Equal(0, cls.HeldSeats);
        Assert.Equal(4, cls.AvailableSeats);
    }

    /// <summary>
    /// Bonus requirement: two independent API instances (separate hosts and connection pools,
    /// standing in for two processes on different ports) share one database.
    /// </summary>
    [Fact]
    public async Task Two_api_instances_sharing_the_database_never_oversell()
    {
        await using var factoryA = new ApiFactory(db.ConnectionString);
        await using var factoryB = new ApiFactory(db.ConnectionString);
        var clientA = factoryA.CreateClient();
        var clientB = factoryB.CreateClient();
        const int seats = 7;
        var classId = await Api.CreateClassAsync(clientA, seats);

        var results = await Task.WhenAll(Enumerable.Range(0, 120).Select(i =>
            Api.HoldAsync(i % 2 == 0 ? clientA : clientB, classId, Api.NewStudentId())));

        Assert.Equal(seats, results.Count(r => r.StatusCode == HttpStatusCode.Created));
        var cls = await Api.GetClassAsync(clientB, classId);
        Assert.Equal(seats, cls.HeldSeats + cls.ConfirmedSeats);
        Assert.Equal(0, cls.AvailableSeats);
    }
}
