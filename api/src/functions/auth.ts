import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { AuthService } from "../authService.js";
import { getConfig, TraceOpsConfig } from "../config.js";
import { authenticate, errorResponse, json, readJson } from "../http.js";
import { TenantMemberRepository, TenantRepository, UserRepository } from "../storage.js";
import { parseSyncUserInput } from "../validation.js";

let cachedConfig: TraceOpsConfig | undefined;
let cachedService: AuthService | undefined;

function getService(): { config: TraceOpsConfig; service: AuthService } {
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
    const authResponse = authenticate(request, config);

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

app.http("syncUser", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/sync-user",
  handler: syncUser
});
