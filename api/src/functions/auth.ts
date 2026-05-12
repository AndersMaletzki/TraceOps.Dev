import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { AuthService, getSupportedPersonalApiKeyScopes } from "../authService.js";
import { getConfig, TraceOpsConfig } from "../config.js";
import { authenticateTrustedRequest, errorResponse, json, readJson } from "../http.js";
import { TenantMemberRepository, TenantRepository, UserRepository } from "../storage.js";
import { parseSyncUserInput } from "../validation.js";

let cachedConfig: TraceOpsConfig | undefined;
let cachedService: AuthService | undefined;

type AuthModuleOverrides = {
  config?: TraceOpsConfig;
  service?: Pick<AuthService, "syncUser">;
};

let testOverrides: AuthModuleOverrides | undefined;

export function setAuthModuleTestOverrides(overrides?: AuthModuleOverrides): void {
  testOverrides = overrides;
  cachedConfig = overrides?.config;
  cachedService = overrides?.service as AuthService | undefined;
}

function getService(): { config: TraceOpsConfig; service: AuthService } {
  if (testOverrides?.config && testOverrides?.service) {
    return {
      config: testOverrides.config,
      service: testOverrides.service as AuthService
    };
  }

  if (!cachedConfig || !cachedService) {
    cachedConfig = getConfig();
    cachedService = new AuthService(
      new UserRepository(cachedConfig),
      new TenantRepository(cachedConfig),
      new TenantMemberRepository(cachedConfig)
    );
  }

  return {
    config: cachedConfig,
    service: cachedService
  };
}

async function handle(
  request: HttpRequest,
  operation: (service: AuthService) => Promise<HttpResponseInit>
): Promise<HttpResponseInit> {
  try {
    const { config, service } = getService();
    const authResponse = authenticateTrustedRequest(request, config);

    if (authResponse) {
      return authResponse;
    }

    return await operation(service);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function syncUser(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service) => {
    const body = await readJson(request);
    const result = await service.syncUser(parseSyncUserInput(body));
    return json(200, result);
  });
}

export async function getSupportedScopes(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async () =>
    json(200, {
      supportedPersonalApiKeyScopes: getSupportedPersonalApiKeyScopes()
    })
  );
}

app.http("syncUser", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/sync-user",
  handler: syncUser
});

app.http("getSupportedScopes", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/personal-api-key-scopes",
  handler: getSupportedScopes
});
