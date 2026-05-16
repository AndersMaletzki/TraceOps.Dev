import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { TraceOpsApiClient } from "../src/apiClient.js";
import { registerTraceOpsTools } from "../src/tools.js";
import { WorkItem, WorkItemSummary } from "../src/types.js";

type ToolHandler = (input: Record<string, unknown>) => Promise<{
  content: Array<{
    type: "text";
    text: string;
  }>;
}>;

type RegisteredTools = Record<string, ToolHandler>;

function createServer(): { server: McpServer; handlers: RegisteredTools } {
  const handlers: RegisteredTools = {};
  const server = {
    tool(name: string, _description: string, _schema: unknown, handler: ToolHandler) {
      handlers[name] = handler;
    }
  };

  return {
    server: server as unknown as McpServer,
    handlers
  };
}

function parseResponse(response: Awaited<ReturnType<ToolHandler>>): unknown {
  return JSON.parse(response.content[0].text);
}

function testWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    tenantId: "tenant",
    repoId: "AndersMaletzki/TraceOps.Dev",
    workItemId: "ITEM~1",
    workItemType: "Issue",
    category: "Bug",
    title: "Fix bug",
    description: "Fix bug",
    severity: "Low",
    status: "New",
    assignedTo: "",
    claimedBy: "",
    claimExpiresAt: "",
    updatedAt: "2026-05-01T00:00:00.000Z",
    externalBranchName: "",
    externalCommitUrl: "",
    externalPrUrl: "",
    source: "test",
    files: [],
    tags: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    createdBy: "codex",
    createdByUserKey: "github|123456",
    assignedToUserKey: "",
    claimedAt: "",
    ...overrides
  };
}

function testSummary(overrides: Partial<WorkItemSummary> = {}): WorkItemSummary {
  return {
    workItemId: "ITEM~1",
    repositoryId: "AndersMaletzki/TraceOps.Dev",
    workItemType: "Issue",
    category: "Bug",
    title: "Fix bug",
    severity: "Low",
    status: "New",
    assignedToUserKey: "",
    claimedByUserKey: "",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    externalLink: "",
    ...overrides
  };
}

function createClient() {
  return {
    authMode: "personal" as const,
    supportsTenantScopedWorkItemAccess: vi.fn(() => true),
    tenantScopedWorkItemAccessError: vi.fn(() => ({
      code: "personal_api_key_required",
      message:
        "Tenant-scoped MCP work item tools require TRACEOPS_API_KEY to be a personal API key. Raw global x-api-key access is reserved for backend-owned website routes."
    })),
    createWorkItem: vi.fn(async () => testWorkItem()),
    searchWorkItems: vi.fn(async () => ({ items: [testSummary()], count: 1 })),
    getActiveWorkItems: vi.fn(async () => ({ items: [testSummary({ status: "InProgress" })], count: 1 })),
    getRecentWorkItems: vi.fn(async () => ({ items: [testSummary()], count: 1 })),
    getWorkItem: vi.fn(async () => testWorkItem()),
    getWorkItemSummary: vi.fn(async () => testSummary()),
    getNextWorkItem: vi.fn(async () => testSummary()),
    updateWorkItemStatus: vi.fn(async () => testWorkItem({ status: "InProgress" })),
    claimWorkItem: vi.fn(async () => testWorkItem({ status: "Claimed", claimedBy: "codex" })),
    updateWorkItemLinks: vi.fn(async () => testWorkItem({ externalBranchName: "codex/test" }))
  };
}

const repoId = "AndersMaletzki/TraceOps.Dev";

const toolCases = [
  {
    name: "create_workitem",
    method: "createWorkItem",
    input: {
      repoId,
      workItemType: "Issue",
      category: "Bug",
      title: "Fix bug",
      description: "Fix bug",
      severity: "Low",
      source: "test",
      createdBy: "codex"
    }
  },
  {
    name: "search_workitems",
    method: "searchWorkItems",
    input: {
      repoId,
      limit: 10
    }
  },
  {
    name: "get_active_workitems",
    method: "getActiveWorkItems",
    input: {
      repoId,
      limit: 10
    }
  },
  {
    name: "get_recent_workitems",
    method: "getRecentWorkItems",
    input: {
      repoId,
      limit: 10
    }
  },
  {
    name: "get_workitem",
    method: "getWorkItem",
    input: {
      repoId,
      workItemId: "ITEM~1"
    }
  },
  {
    name: "get_workitem_summary",
    method: "getWorkItemSummary",
    input: {
      repoId,
      workItemId: "ITEM~1"
    }
  },
  {
    name: "get_next_workitem",
    method: "getNextWorkItem",
    input: {
      repoId,
      limit: 10
    }
  },
  {
    name: "update_workitem_status",
    method: "updateWorkItemStatus",
    input: {
      repoId,
      workItemId: "ITEM~1",
      status: "InProgress",
      actor: "codex"
    }
  },
  {
    name: "claim_workitem",
    method: "claimWorkItem",
    input: {
      repoId,
      workItemId: "ITEM~1",
      claimedBy: "codex"
    }
  },
  {
    name: "update_workitem_links",
    method: "updateWorkItemLinks",
    input: {
      repoId,
      workItemId: "ITEM~1",
      externalBranchName: "codex/test"
    }
  }
] as const;

describe("registerTraceOpsTools", () => {
  it("registers get_context with default tenant state and no global repo", async () => {
    const { server, handlers } = createServer();
    registerTraceOpsTools(server, createClient() as unknown as TraceOpsApiClient, {
      defaultTenantId: "anders"
    });

    await expect(parseResponse(await handlers.get_context({}))).toEqual({
      tenantId: "anders",
      repoId: null,
      hasDefaultTenant: true,
      authMode: "personal",
      tenantScopedWorkItemAccess: true
    });
  });

  it("registers get_context without inventing tenant or repo context", async () => {
    const { server, handlers } = createServer();
    registerTraceOpsTools(server, createClient() as unknown as TraceOpsApiClient);

    await expect(parseResponse(await handlers.get_context({}))).toEqual({
      tenantId: null,
      repoId: null,
      hasDefaultTenant: false,
      authMode: "personal",
      tenantScopedWorkItemAccess: true
    });
  });

  it("returns MCP auth guardrails instead of calling the API with a raw global key", async () => {
    for (const toolCase of toolCases) {
      const { server, handlers } = createServer();
      const client = createClient();
      client.authMode = "global";
      client.supportsTenantScopedWorkItemAccess.mockReturnValue(false);
      registerTraceOpsTools(server, client as unknown as TraceOpsApiClient, {
        defaultTenantId: "anders"
      });

      const response = parseResponse(await handlers[toolCase.name](toolCase.input));

      expect(response).toEqual({
        error: {
          code: "personal_api_key_required",
          message:
            "Tenant-scoped MCP work item tools require TRACEOPS_API_KEY to be a personal API key. Raw global x-api-key access is reserved for backend-owned website routes."
        }
      });
      expect(client[toolCase.method]).not.toHaveBeenCalled();
    }
  });

  it("passes explicit tenantId through instead of the configured default", async () => {
    const { server, handlers } = createServer();
    const client = createClient();
    registerTraceOpsTools(server, client as unknown as TraceOpsApiClient, {
      defaultTenantId: "default"
    });

    await handlers.search_workitems({
      repoId,
      tenantId: "explicit"
    });

    expect(client.searchWorkItems).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "explicit",
        repoId
      })
    );
  });

  it("returns compact summary payloads for summary-first tools", async () => {
    const { server, handlers } = createServer();
    const client = createClient();
    registerTraceOpsTools(server, client as unknown as TraceOpsApiClient, {
      defaultTenantId: "anders"
    });

    const searchResponse = parseResponse(
      await handlers.search_workitems({
        repoId,
        limit: 10
      })
    ) as { items: Array<Record<string, unknown>> };
    const summaryResponse = parseResponse(
      await handlers.get_workitem_summary({
        repoId,
        workItemId: "ITEM~1"
      })
    ) as Record<string, unknown>;

    expect(searchResponse.items[0]).toMatchObject({
      workItemId: "ITEM~1",
      repositoryId: repoId,
      title: "Fix bug"
    });
    expect(searchResponse.items[0]).not.toHaveProperty("description");
    expect(searchResponse.items[0]).not.toHaveProperty("files");
    expect(summaryResponse).not.toHaveProperty("description");
    expect(client.searchWorkItems).toHaveBeenCalled();
    expect(client.getWorkItemSummary).toHaveBeenCalled();
  });

  it("uses the configured default tenantId for every work item tool", async () => {
    for (const toolCase of toolCases) {
      const { server, handlers } = createServer();
      const client = createClient();
      registerTraceOpsTools(server, client as unknown as TraceOpsApiClient, {
        defaultTenantId: "anders"
      });

      await handlers[toolCase.name](toolCase.input);

      expect(client[toolCase.method]).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "anders",
          repoId
        })
      );
    }
  });

  it("returns a structured missing tenant error for every work item tool without calling the API", async () => {
    for (const toolCase of toolCases) {
      const { server, handlers } = createServer();
      const client = createClient();
      registerTraceOpsTools(server, client as unknown as TraceOpsApiClient);

      const response = parseResponse(await handlers[toolCase.name](toolCase.input));

      expect(response).toEqual({
        error: {
          code: "missing_tenant_id",
          message: "tenantId is required when TRACEOPS_DEFAULT_TENANT_ID is not configured."
        }
      });
      expect(client[toolCase.method]).not.toHaveBeenCalled();
    }
  });
});
