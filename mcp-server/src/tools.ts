import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TraceOpsApiClient } from "./apiClient.js";
import {
  workItemCategories,
  workItemSeverities,
  workItemStatuses,
  workItemTypes,
  WorkItem,
  WorkItemSummary
} from "./types.js";

const tenantRepoSchema = {
  tenantId: z.string().min(1),
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

export function registerTraceOpsTools(server: McpServer, client: TraceOpsApiClient): void {
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
      assignedTo: z.string().optional(),
      externalBranchName: z.string().optional(),
      externalCommitUrl: z.string().optional(),
      externalPrUrl: z.string().optional()
    },
    async (input) => result(summarize(await client.createWorkItem(input)))
  );

  server.tool(
    "search_workitems",
    "Search TraceOps work items in a tenant/repository partition.",
    filterSchema,
    async (input) => {
      const response = await client.searchWorkItems(input);
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
    async (input) => result(await client.getWorkItem(input))
  );

  server.tool(
    "get_next_workitem",
    "Get the next actionable TraceOps work item.",
    filterSchema,
    async (input) => result(summarize(await client.getNextWorkItem(input)))
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
    async (input) => result(summarize(await client.updateWorkItemStatus(input)))
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
    async (input) => result(summarize(await client.claimWorkItem(input)))
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
    async (input) => result(summarize(await client.updateWorkItemLinks(input)))
  );
}
