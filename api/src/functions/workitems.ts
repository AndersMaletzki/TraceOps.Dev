import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ApiKeyService } from "../apiKeyService.js";
import { AuthService } from "../authService.js";
import { getConfig, TraceOpsConfig } from "../config.js";
import { AuthContext } from "../domain.js";
import {
  authenticate,
  assertApiKeyScope,
  assertAuthorizedTenant,
  callerUserKeyFromAuth,
  errorResponse,
  json,
  parseAppWorkItemFiltersFromQuery,
  parseClaimBody,
  parseFiltersFromQuery,
  parseLinksBody,
  parseTenantRepoBody,
  parseUpdateStatusBody,
  readJson
} from "../http.js";
import { ApiKeyRepository, TenantMemberRepository, TenantRepository, UserRepository, WorkItemRepository } from "../storage.js";
import { parseCreateWorkItemInput } from "../validation.js";
import { WorkItemService } from "../workItemService.js";

let cachedConfig: TraceOpsConfig | undefined;
let cachedService: WorkItemService | undefined;
let cachedAuthService: AuthService | undefined;
let cachedApiKeyService: ApiKeyService | undefined;

type WorkItemsModuleOverrides = {
  config?: TraceOpsConfig;
  service?: Pick<WorkItemService, "create" | "list" | "get" | "getNext" | "updateStatus" | "claim" | "updateLinks" | "listAppWorkItems">;
  authService?: Pick<AuthService, "assertTenantMember">;
  apiKeyService?: Pick<ApiKeyService, "authenticatePersonalApiKey">;
};

let testOverrides: WorkItemsModuleOverrides | undefined;

export function setWorkItemsModuleTestOverrides(overrides?: WorkItemsModuleOverrides): void {
  testOverrides = overrides;
  cachedConfig = overrides?.config;
  cachedService = overrides?.service as WorkItemService | undefined;
  cachedAuthService = overrides?.authService as AuthService | undefined;
  cachedApiKeyService = overrides?.apiKeyService as ApiKeyService | undefined;
}

function getService(): {
  config: TraceOpsConfig;
  service: WorkItemService;
  authService: AuthService;
  apiKeyService: ApiKeyService;
} {
  if (
    testOverrides?.config &&
    testOverrides?.service &&
    testOverrides?.authService &&
    testOverrides?.apiKeyService
  ) {
    return {
      config: testOverrides.config,
      service: testOverrides.service as WorkItemService,
      authService: testOverrides.authService as AuthService,
      apiKeyService: testOverrides.apiKeyService as ApiKeyService
    };
  }

  if (!cachedConfig || !cachedService || !cachedAuthService || !cachedApiKeyService) {
    cachedConfig = getConfig();
    cachedAuthService = new AuthService(
      new UserRepository(cachedConfig),
      new TenantRepository(cachedConfig),
      new TenantMemberRepository(cachedConfig)
    );
    cachedService = new WorkItemService(new WorkItemRepository(cachedConfig), cachedAuthService);
    cachedApiKeyService = new ApiKeyService(
      new ApiKeyRepository(cachedConfig),
      cachedAuthService,
      cachedConfig.apiKeyHashSecret
    );
  }

  return {
    config: cachedConfig,
    service: cachedService,
    authService: cachedAuthService,
    apiKeyService: cachedApiKeyService
  };
}

async function handle(
  request: HttpRequest,
  operation: (
    service: WorkItemService,
    authService: AuthService,
    auth: AuthContext
  ) => Promise<HttpResponseInit>
): Promise<HttpResponseInit> {
  try {
    const { config, service, authService, apiKeyService } = getService();
    const auth = await authenticate(request, config, apiKeyService);

    if (!("kind" in auth)) {
      return auth;
    }

    return await operation(service, authService, auth);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function createWorkItem(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service, authService, auth) => {
    const body = await readJson(request);
    const input = parseCreateWorkItemInput(body);

    assertApiKeyScope(auth, "workitems:create");
    assertAuthorizedTenant(auth, input.tenantId);

    if (auth.kind === "personal") {
      await authService.assertTenantMember(auth.userKey, input.tenantId);
    }

    const workItem = await service.create(input);
    return json(201, workItem);
  });
}

export async function listWorkItems(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service, _authService, auth) => {
    const filters = parseFiltersFromQuery(request);
    filters.callerUserKey = callerUserKeyFromAuth(request, auth);

    assertApiKeyScope(auth, "workitems:read");
    assertAuthorizedTenant(auth, filters.tenantId);

    const workItems = await service.list(filters);
    return json(200, { items: workItems, count: workItems.length });
  });
}

export async function getWorkItem(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service, _authService, auth) => {
    const workItemId = request.params.workItemId;
    const tenantId = request.query.get("tenantId");
    const repoId = request.query.get("repoId");
    const body = parseTenantRepoBody({ tenantId, repoId });

    assertApiKeyScope(auth, "workitems:read");
    assertAuthorizedTenant(auth, body.tenantId);

    const workItem = await service.get(
      body.tenantId,
      body.repoId,
      workItemId,
      callerUserKeyFromAuth(request, auth)
    );
    return json(200, workItem);
  });
}

export async function getNextWorkItem(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service, _authService, auth) => {
    const filters = parseFiltersFromQuery(request);
    filters.callerUserKey = callerUserKeyFromAuth(request, auth);

    assertApiKeyScope(auth, "workitems:read");
    assertAuthorizedTenant(auth, filters.tenantId);

    const workItem = await service.getNext(filters);
    return workItem ? json(200, workItem) : json(404, { error: "No actionable work item found" });
  });
}

export async function updateWorkItemStatus(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service, authService, auth) => {
    const body = await readJson(request);
    const input = parseUpdateStatusBody(body);

    assertApiKeyScope(auth, "workitems:update");
    assertAuthorizedTenant(auth, input.tenantId);

    if (auth.kind === "personal") {
      await authService.assertTenantMember(auth.userKey, input.tenantId);
    }

    const workItem = await service.updateStatus(request.params.workItemId, input);
    return json(200, workItem);
  });
}

export async function claimWorkItem(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service, authService, auth) => {
    const body = await readJson(request);
    const input = parseClaimBody(body);

    assertApiKeyScope(auth, "workitems:update");
    assertAuthorizedTenant(auth, input.tenantId);

    if (auth.kind === "personal") {
      await authService.assertTenantMember(auth.userKey, input.tenantId);
    }

    const workItem = await service.claim(request.params.workItemId, input);
    return json(200, workItem);
  });
}

export async function updateWorkItemLinks(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service, authService, auth) => {
    const body = await readJson(request);
    const input = parseLinksBody(body);

    assertApiKeyScope(auth, "workitems:update");
    assertAuthorizedTenant(auth, input.tenantId);

    if (auth.kind === "personal") {
      await authService.assertTenantMember(auth.userKey, input.tenantId);
    }

    const workItem = await service.updateLinks(request.params.workItemId, input);
    return json(200, workItem);
  });
}

export async function listAppWorkItems(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service, _authService, auth) => {
    if (auth.kind !== "global") {
      return json(403, { error: "Trusted website authentication is required" });
    }

    const filters = parseAppWorkItemFiltersFromQuery(request);
    return json(200, await service.listAppWorkItems(filters));
  });
}

app.http("createWorkItem", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "workitems",
  handler: createWorkItem
});

app.http("listWorkItems", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "workitems",
  handler: listWorkItems
});

app.http("getNextWorkItem", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "workitems/next",
  handler: getNextWorkItem
});

app.http("getWorkItem", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "workitems/{workItemId}",
  handler: getWorkItem
});

app.http("updateWorkItemStatus", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "workitems/{workItemId}/status",
  handler: updateWorkItemStatus
});

app.http("claimWorkItem", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "workitems/{workItemId}/claim",
  handler: claimWorkItem
});

app.http("updateWorkItemLinks", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "workitems/{workItemId}/links",
  handler: updateWorkItemLinks
});

app.http("listAppWorkItems", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "app/workitems",
  handler: listAppWorkItems
});
