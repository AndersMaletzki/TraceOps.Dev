import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  AdminMetricsService,
  AzureMonitorRequestTelemetryStore,
  AzureTableAdminDependencyStore
} from "../adminMetricsService.js";
import { getConfig, TraceOpsConfig } from "../config.js";
import { authenticateTrustedRequest, errorResponse, json, parseCallerUserKey } from "../http.js";
import { UserRepository, WorkItemRepository } from "../storage.js";
import { requiredString } from "../validation.js";

let cachedConfig: TraceOpsConfig | undefined;
let cachedService: AdminMetricsService | undefined;

type AdminModuleOverrides = {
  config?: TraceOpsConfig;
  service?: Pick<
    AdminMetricsService,
    "assertAdminUser" | "getUserMetrics" | "getIssueMetrics" | "getRequestMetrics" | "getHealth" | "getDiagnostics"
  >;
};

let testOverrides: AdminModuleOverrides | undefined;

export function setAdminModuleTestOverrides(overrides?: AdminModuleOverrides): void {
  testOverrides = overrides;
  cachedConfig = overrides?.config;
  cachedService = overrides?.service as AdminMetricsService | undefined;
}

function getService(): { config: TraceOpsConfig; service: AdminMetricsService } {
  if (testOverrides?.config && testOverrides?.service) {
    return {
      config: testOverrides.config,
      service: testOverrides.service as AdminMetricsService
    };
  }

  if (!cachedConfig || !cachedService) {
    cachedConfig = getConfig();
    cachedService = new AdminMetricsService(
      new UserRepository(cachedConfig),
      new WorkItemRepository(cachedConfig),
      new AzureMonitorRequestTelemetryStore(),
      cachedConfig.logAnalyticsWorkspaceId,
      new AzureTableAdminDependencyStore(cachedConfig),
      cachedConfig
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
    const authResponse = authenticateTrustedRequest(request, config);

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

export async function getRequestMetrics(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service) => json(200, await service.getRequestMetrics()));
}

export async function getHealth(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service) => json(200, await service.getHealth()));
}

export async function getDiagnostics(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service) => json(200, await service.getDiagnostics()));
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

app.http("getRequestMetrics", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app/admin/metrics/requests",
  handler: getRequestMetrics
});

app.http("getHealth", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app/admin/health",
  handler: getHealth
});

app.http("getDiagnostics", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app/admin/diagnostics",
  handler: getDiagnostics
});
