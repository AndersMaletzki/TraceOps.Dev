import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getConfig, TraceOpsConfig } from "../config.js";
import {
  authenticate,
  errorResponse,
  json,
  parseClaimBody,
  parseFiltersFromQuery,
  parseLinksBody,
  parseTenantRepoBody,
  parseUpdateStatusBody,
  readJson
} from "../http.js";
import { WorkItemRepository } from "../storage.js";
import { parseCreateWorkItemInput } from "../validation.js";
import { WorkItemService } from "../workItemService.js";

let cachedConfig: TraceOpsConfig | undefined;
let cachedService: WorkItemService | undefined;

function getService(): { config: TraceOpsConfig; service: WorkItemService } {
  if (!cachedConfig || !cachedService) {
    cachedConfig = getConfig();
    cachedService = new WorkItemService(new WorkItemRepository(cachedConfig));
  }

  return {
    config: cachedConfig,
    service: cachedService
  };
}

async function handle(
  request: HttpRequest,
  operation: (service: WorkItemService) => Promise<HttpResponseInit>
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

export async function createWorkItem(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service) => {
    const body = await readJson(request);
    const workItem = await service.create(parseCreateWorkItemInput(body));
    return json(201, workItem);
  });
}

export async function listWorkItems(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service) => {
    const workItems = await service.list(parseFiltersFromQuery(request));
    return json(200, { items: workItems, count: workItems.length });
  });
}

export async function getWorkItem(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service) => {
    const workItemId = request.params.workItemId;
    const tenantId = request.query.get("tenantId");
    const repoId = request.query.get("repoId");
    const body = parseTenantRepoBody({ tenantId, repoId });
    const workItem = await service.get(body.tenantId, body.repoId, workItemId);
    return json(200, workItem);
  });
}

export async function getNextWorkItem(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service) => {
    const workItem = await service.getNext(parseFiltersFromQuery(request));
    return workItem ? json(200, workItem) : json(404, { error: "No actionable work item found" });
  });
}

export async function updateWorkItemStatus(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service) => {
    const body = await readJson(request);
    const workItem = await service.updateStatus(request.params.workItemId, parseUpdateStatusBody(body));
    return json(200, workItem);
  });
}

export async function claimWorkItem(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service) => {
    const body = await readJson(request);
    const workItem = await service.claim(request.params.workItemId, parseClaimBody(body));
    return json(200, workItem);
  });
}

export async function updateWorkItemLinks(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return handle(request, async (service) => {
    const body = await readJson(request);
    const workItem = await service.updateLinks(request.params.workItemId, parseLinksBody(body));
    return json(200, workItem);
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
