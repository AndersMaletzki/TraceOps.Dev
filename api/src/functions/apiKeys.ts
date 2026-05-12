import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ApiKeyService } from "../apiKeyService.js";
import { AuthService } from "../authService.js";
import { getConfig, TraceOpsConfig } from "../config.js";
import {
  authenticateTrustedRequest,
  errorResponse,
  json,
  parseCallerUserKey,
  parseTrustedTenantId,
  readJson
} from "../http.js";
import { ApiKeyRepository, TenantMemberRepository, TenantRepository, UserRepository } from "../storage.js";
import { parseCreateApiKeyInput, requiredString } from "../validation.js";

let cachedConfig: TraceOpsConfig | undefined;
let cachedService: ApiKeyService | undefined;

type ApiKeysModuleOverrides = {
  config?: TraceOpsConfig;
  service?: Pick<
    ApiKeyService,
    "createApiKey" | "listApiKeysForUser" | "revokeApiKey" | "resolveTenantIdForUser"
  >;
};

let testOverrides: ApiKeysModuleOverrides | undefined;

export function setApiKeysModuleTestOverrides(overrides?: ApiKeysModuleOverrides): void {
  testOverrides = overrides;
  cachedConfig = overrides?.config;
  cachedService = overrides?.service as ApiKeyService | undefined;
}

function getService(): { config: TraceOpsConfig; service: ApiKeyService } {
  if (testOverrides?.config && testOverrides?.service) {
    return {
      config: testOverrides.config,
      service: testOverrides.service as ApiKeyService
    };
  }

  if (!cachedConfig || !cachedService) {
    cachedConfig = getConfig();
    const authService = new AuthService(
      new UserRepository(cachedConfig),
      new TenantRepository(cachedConfig),
      new TenantMemberRepository(cachedConfig)
    );
    cachedService = new ApiKeyService(
      new ApiKeyRepository(cachedConfig),
      authService,
      cachedConfig.apiKeyHashSecret
    );
  }

  return {
    config: cachedConfig,
    service: cachedService
  };
}

function trustedIdentityFromRequest(request: HttpRequest): { userKey: string; tenantId?: string } {
  return {
    userKey: requiredString(parseCallerUserKey(request), "x-traceops-user-key"),
    tenantId: parseTrustedTenantId(request)
  };
}

async function handle(
  request: HttpRequest,
  operation: (service: ApiKeyService, identity: { userKey: string; tenantId: string }) => Promise<HttpResponseInit>
): Promise<HttpResponseInit> {
  try {
    const { config, service } = getService();
    const authResponse = authenticateTrustedRequest(request, config);

    if (authResponse) {
      return authResponse;
    }

    return await operation(service, trustedIdentityFromRequest(request));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function createApiKey(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service, identity) => {
    const body = await readJson(request);
    const input = parseCreateApiKeyInput(body);
    const tenantId = await service.resolveTenantIdForUser(identity.userKey, identity.tenantId);
    const result = await service.createApiKey({
      tenantId,
      userKey: identity.userKey,
      ...input
    });

    return json(201, result);
  });
}

export async function listApiKeys(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service, identity) => {
    const tenantId = await service.resolveTenantIdForUser(identity.userKey, identity.tenantId);
    return json(200, { items: await service.listApiKeysForUser(tenantId, identity.userKey) });
  });
}

export async function revokeApiKey(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service, identity) => {
    const tenantId = await service.resolveTenantIdForUser(identity.userKey, identity.tenantId);
    return json(200, await service.revokeApiKey(tenantId, identity.userKey, request.params.apiKeyId));
  });
}

app.http("createApiKey", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "me/api-keys",
  handler: createApiKey
});

app.http("listApiKeys", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/api-keys",
  handler: listApiKeys
});

app.http("revokeApiKey", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "me/api-keys/{apiKeyId}",
  handler: revokeApiKey
});
