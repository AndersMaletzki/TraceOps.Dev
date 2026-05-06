import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { AdminMetricsService } from "../adminMetricsService.js";
import { getConfig, TraceOpsConfig } from "../config.js";
import { authenticate, errorResponse, json, parseCallerUserKey } from "../http.js";
import { UserRepository, WorkItemRepository } from "../storage.js";
import { requiredString } from "../validation.js";

let cachedConfig: TraceOpsConfig | undefined;
let cachedService: AdminMetricsService | undefined;

function getService(): { config: TraceOpsConfig; service: AdminMetricsService } {
  if (!cachedConfig || !cachedService) {
    cachedConfig = getConfig();
    cachedService = new AdminMetricsService(
      new UserRepository(cachedConfig),
      new WorkItemRepository(cachedConfig)
    );
  }

  return {
    config: cachedConfig,
    service: cachedService
  };
}

async function handle(
  request: HttpRequest,
  operation: (service: AdminMetricsService) => Promise<HttpResponseInit>
): Promise<HttpResponseInit> {
  try {
    const { config, service } = getService();
    const authResponse = authenticate(request, config);

    if (authResponse) {
      return authResponse;
    }

    await service.assertAdminUser(requiredString(parseCallerUserKey(request), "callerUserKey"));

    return await operation(service);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function getUserMetrics(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service) => json(200, await service.getUserMetrics()));
}

export async function getIssueMetrics(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service) => json(200, await service.getIssueMetrics()));
}

app.http("getUserMetrics", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app/admin/metrics/users",
  handler: getUserMetrics
});

app.http("getIssueMetrics", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app/admin/metrics/issues",
  handler: getIssueMetrics
});
