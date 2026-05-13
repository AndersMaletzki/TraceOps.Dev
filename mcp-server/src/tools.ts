import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TraceOpsApiClient } from "./apiClient.js";
import { resolveTenantId, TraceOpsMcpContext } from "./context.js";
import {
  workItemCategories,
  workItemSeverities,
  workItemStatuses,
  workItemTypes,
  WorkItem,
  WorkItemSummary
} from "./types.js";

const tenantRepoSchema = {
  tenantId: z.string().min(1).optional(),
  repoId: z.string().min(1)
};

const filterSchema = {
  ...tenantRepoSchema,
  status: z.enum(workItemStatuses).optional(),
  severity: z.enum(workItemSeverities).optional(),
  workItemType: z.enum(workItemTypes).optional(),
  category: z.enum(workItemCategories).optional(),
  limit: z.number().int().min(1).max(50).default(10)
};

function summarize(workItem: WorkItem): WorkItemSummary {
  return {
    workItemId: workItem.workItemId,
    workItemType: workItem.workItemType,
    category: workItem.category,
    title: workItem.title,
    severity: workItem.severity,
    status: workItem.status,
    assignedTo: workItem.assignedTo,
    assignedToUserKey: workItem.assignedToUserKey,
    claimedBy: workItem.claimedBy,
    claimExpiresAt: workItem.claimExpiresAt,
    updatedAt: workItem.updatedAt,
    externalBranchName: workItem.externalBranchName,
    externalCommitUrl: workItem.externalCommitUrl,
    externalPrUrl: workItem.externalPrUrl
  };
}

function result(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

function tenantScopedAuthGuardrail(client: TraceOpsApiClient) {
  if (client.supportsTenantScopedWorkItemAccess()) {
    return undefined;
  }

  return result({
    error: client.tenantScopedWorkItemAccessError()
  });
}

function withResolvedTenant<T extends { tenantId?: string }>(
  input: T,
  context: TraceOpsMcpContext
): { ok: true; input: Omit<T, "tenantId"> & { tenantId: string } } | { ok: false; error: unknown } {
  const tenantResolution = resolveTenantId(input.tenantId, context.defaultTenantId);

  if (!tenantResolution.ok) {
    return {
      ok: false,
      error: {
        error: tenantResolution.error
      }
    };
  }

  return {
    ok: true,
    input: {
      ...input,
      tenantId: tenantResolution.tenantId
    }
  };
}

export function registerTraceOpsTools(
  server: McpServer,
  client: TraceOpsApiClient,
  context: TraceOpsMcpContext = {}
): void {
  server.tool(
    "get_context",
    "Get the current TraceOps MCP context.",
    {},
    async () =>
      result({
        tenantId: context.defaultTenantId ?? null,
        repoId: null,
        hasDefaultTenant: Boolean(context.defaultTenantId),
        authMode: client.authMode,
        tenantScopedWorkItemAccess: client.supportsTenantScopedWorkItemAccess()
      })
  );

  server.tool(
    "create_workitem",
    "Create one TraceOps work item.",
    {
      ...tenantRepoSchema,
      workItemType: z.enum(workItemTypes),
      category: z.enum(workItemCategories),
      title: z.string().min(1),
      description: z.string().min(1),
      severity: z.enum(workItemSeverities),
      status: z.enum(workItemStatuses).optional(),
      source: z.string().min(1),
      files: z.array(z.string()).default([]),
      tags: z.array(z.string()).default([]),
      createdBy: z.string().min(1),
      createdByUserKey: z.string().optional(),
      assignedTo: z.string().optional(),
      assignedToUserKey: z.string().optional(),
      externalBranchName: z.string().optional(),
      externalCommitUrl: z.string().optional(),
      externalPrUrl: z.string().optional()
    },
    async (input) => {
      const authGuardrail = tenantScopedAuthGuardrail(client);
      if (authGuardrail) {
        return authGuardrail;
      }

      const resolved = withResolvedTenant(input, context);
      if (!resolved.ok) {
        return result(resolved.error);
      }

      return result(summarize(await client.createWorkItem(resolved.input)));
    }
  );

  server.tool(
    "search_workitems",
    "Search TraceOps work items in a tenant/repository partition.",
    filterSchema,
    async (input) => {
      const authGuardrail = tenantScopedAuthGuardrail(client);
      if (authGuardrail) {
        return authGuardrail;
      }

      const resolved = withResolvedTenant(input, context);
      if (!resolved.ok) {
        return result(resolved.error);
      }

      const response = await client.searchWorkItems(resolved.input);
      return result({
        count: response.count,
        items: response.items.map(summarize)
      });
    }
  );

  server.tool(
    "get_workitem",
    "Get one TraceOps work item.",
    {
      ...tenantRepoSchema,
      workItemId: z.string().min(1)
    },
    async (input) => {
      const authGuardrail = tenantScopedAuthGuardrail(client);
      if (authGuardrail) {
        return authGuardrail;
      }

      const resolved = withResolvedTenant(input, context);
      if (!resolved.ok) {
        return result(resolved.error);
      }

      return result(await client.getWorkItem(resolved.input));
    }
  );

  server.tool(
    "get_next_workitem",
    "Get the next actionable TraceOps work item.",
    filterSchema,
    async (input) => {
      const authGuardrail = tenantScopedAuthGuardrail(client);
      if (authGuardrail) {
        return authGuardrail;
      }

      const resolved = withResolvedTenant(input, context);
      if (!resolved.ok) {
        return result(resolved.error);
      }

      return result(summarize(await client.getNextWorkItem(resolved.input)));
    }
  );

  server.tool(
    "update_workitem_status",
    "Update a TraceOps work item status.",
    {
      ...tenantRepoSchema,
      workItemId: z.string().min(1),
      status: z.enum(workItemStatuses),
      actor: z.string().min(1)
    },
    async (input) => {
      const authGuardrail = tenantScopedAuthGuardrail(client);
      if (authGuardrail) {
        return authGuardrail;
      }

      const resolved = withResolvedTenant(input, context);
      if (!resolved.ok) {
        return result(resolved.error);
      }

      return result(summarize(await client.updateWorkItemStatus(resolved.input)));
    }
  );

  server.tool(
    "claim_workitem",
    "Claim a TraceOps work item for an agent or user.",
    {
      ...tenantRepoSchema,
      workItemId: z.string().min(1),
      claimedBy: z.string().min(1),
      claimDurationMinutes: z.number().int().min(1).optional()
    },
    async (input) => {
      const authGuardrail = tenantScopedAuthGuardrail(client);
      if (authGuardrail) {
        return authGuardrail;
      }

      const resolved = withResolvedTenant(input, context);
      if (!resolved.ok) {
        return result(resolved.error);
      }

      return result(summarize(await client.claimWorkItem(resolved.input)));
    }
  );

  server.tool(
    "update_workitem_links",
    "Store external branch, commit, or PR metadata for a TraceOps work item.",
    {
      ...tenantRepoSchema,
      workItemId: z.string().min(1),
      externalBranchName: z.string().optional(),
      externalCommitUrl: z.string().optional(),
      externalPrUrl: z.string().optional()
    },
    async (input) => {
      const authGuardrail = tenantScopedAuthGuardrail(client);
      if (authGuardrail) {
        return authGuardrail;
      }

      const resolved = withResolvedTenant(input, context);
      if (!resolved.ok) {
        return result(resolved.error);
      }

      return result(summarize(await client.updateWorkItemLinks(resolved.input)));
    }
  );
}
