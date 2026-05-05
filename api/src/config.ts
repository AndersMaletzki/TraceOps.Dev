import { requireSha256Hex } from "./apiKey.js";

export type TraceOpsConfig = {
  apiKey: string;
  storageConnectionString: string;
  workItemsTableName: string;
  workItemEventsTableName: string;
  usersTableName: string;
  tenantsTableName: string;
  tenantMembersTableName: string;
};

export function getConfig(env: NodeJS.ProcessEnv = process.env): TraceOpsConfig {
  const apiKey = env.TRACEOPS_API_KEY;
  const storageConnectionString = env.TRACEOPS_STORAGE_CONNECTION_STRING;

  if (!apiKey) {
    throw new Error("TRACEOPS_API_KEY is required");
  }

  if (!storageConnectionString) {
    throw new Error("TRACEOPS_STORAGE_CONNECTION_STRING is required");
  }

  return {
    apiKey: requireSha256Hex(apiKey, "TRACEOPS_API_KEY"),
    storageConnectionString,
    workItemsTableName: env.TRACEOPS_TABLE_WORKITEMS || "WorkItems",
    workItemEventsTableName: env.TRACEOPS_TABLE_WORKITEM_EVENTS || "WorkItemEvents",
    usersTableName: env.TRACEOPS_TABLE_USERS || "TraceOpsUsers",
    tenantsTableName: env.TRACEOPS_TABLE_TENANTS || "TraceOpsTenants",
    tenantMembersTableName: env.TRACEOPS_TABLE_TENANT_MEMBERS || "TraceOpsTenantMembers"
  };
}
