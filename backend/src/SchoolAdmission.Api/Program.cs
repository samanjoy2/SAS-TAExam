using Microsoft.AspNetCore.Http.Json;
using Npgsql;
using SchoolAdmission.Api;
using SchoolAdmission.Api.Domain;
using SchoolAdmission.Api.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Listen on :8080 unless the host was told otherwise (ASPNETCORE_URLS / ASPNETCORE_HTTP_PORTS / --urls).
if (string.IsNullOrEmpty(builder.Configuration["urls"]) &&
    string.IsNullOrEmpty(builder.Configuration["http_ports"]) &&
    string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_HTTP_PORTS")))
{
    builder.WebHost.UseUrls("http://0.0.0.0:8080");
}

// Options are resolved lazily from IConfiguration so env vars / test overrides always win.
builder.Services.AddSingleton(sp => AdmissionOptions.FromConfiguration(sp.GetRequiredService<IConfiguration>()));
builder.Services.AddSingleton(sp =>
{
    var opts = sp.GetRequiredService<AdmissionOptions>();
    var dsb = new NpgsqlDataSourceBuilder(opts.ConnectionString);
    // Keep each process well under Postgres' max_connections (100 by default) so that a burst of
    // requests queues for a pooled connection instead of failing with "too many clients".
    if (!opts.ConnectionString.Contains("pool size", StringComparison.OrdinalIgnoreCase))
        dsb.ConnectionStringBuilder.MaxPoolSize = opts.MaxPoolSize;
    if (!opts.ConnectionString.Contains("timeout", StringComparison.OrdinalIgnoreCase))
        dsb.ConnectionStringBuilder.Timeout = 30;
    return dsb.Build();
});
builder.Services.AddSingleton<AdmissionService>();
builder.Services.AddHostedService<DatabaseInitHostedService>();
builder.Services.AddHostedService<ExpirySweeper>();

builder.Services.Configure<RouteHandlerOptions>(o => o.ThrowOnBadRequest = true);
builder.Services.Configure<JsonOptions>(o => o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);

// The React UI is served from a different origin (localhost:3000), so allow cross-origin calls.
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

app.UseMiddleware<ErrorHandlingMiddleware>();
app.UseCors();

app.MapAdmissionEndpoints();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Unknown routes also get a JSON error body.
app.MapFallback((HttpContext ctx) => Results.Json(
    new ErrorResponse(ErrorCodes.NotFound, $"No endpoint for {ctx.Request.Method} {ctx.Request.Path}."),
    statusCode: StatusCodes.Status404NotFound));

app.Run();

/// <summary>Exposed for WebApplicationFactory in tests.</summary>
public partial class Program;
