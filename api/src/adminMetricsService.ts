import { DefaultAzureCredential } from "@azure/identity";
import { TableClient } from "@azure/data-tables";
import { LogsQueryClient, LogsQueryResultStatus } from "@azure/monitor-query-logs";
import {
  AdminDiagnostics,
  AdminHealth,
  IssueMetrics,
  RequestMetrics,
  RuntimeConfigHealth,
  StorageDependencyHealth,
  TelemetryDependencyHealth,
  TraceOpsUser,
  UserMetrics,
  WorkItem
} from "./domain.js";
import { TraceOpsConfig } from "./config.js";
import { isStorageNotFound, toWorkItem, UserRepository, WorkItemRepository } from "./storage.js";

type UserStore = Pick<UserRepository, "getUser" | "listUsers">;
type WorkItemStore = Pick<WorkItemRepository, "listAllWorkItems">;

type LogsTable = {
  rows: unknown[][];
};

type LogsQuerySuccess = {
  status: string;
  tables?: LogsTable[];
};

export type RequestTelemetryStore = {
  getRequestMetrics(workspaceId: string): Promise<RequestMetrics>;
};

export type AdminDependencyStore = {
  getStorageHealth(): Promise<StorageDependencyHealth>;
};

export class AdminAccessDeniedError extends Error {
  constructor() {
    super("Admin access is required");
    this.name = "AdminAccessDeniedError";
  }
}

function isAtOrAfter(value: string, threshold: Date): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= threshold.getTime();
}

function daysAgo(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function providerIsMicrosoft(user: TraceOpsUser): boolean {
  const provider = user.identityProvider.toLowerCase();
  return provider === "aad" || provider === "microsoft" || provider === "entra";
}

function finiteMetric(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function wholeMetric(value: unknown): number {
  return Math.trunc(finiteMetric(value));
}

export class AzureMonitorRequestTelemetryStore implements RequestTelemetryStore {
  private readonly client = new LogsQueryClient(new DefaultAzureCredential());

  async getRequestMetrics(workspaceId: string): Promise<RequestMetrics> {
    const result = await this.client.queryWorkspace(
      workspaceId,
      `
AppRequests
| summarize
    requestsToday = sumif(ItemCount, TimeGenerated >= startofday(now())),
    requestsLast7Days = sum(ItemCount),
    failedRequests = sumif(ItemCount, Success == false),
    averageResponseDurationMs = avg(DurationMs)
`,
      { duration: "P7D" }
    );

    if (result.status !== LogsQueryResultStatus.Success) {
      throw new Error("Application Insights request metrics query failed");
    }

    return requestMetricsFromLogsResult(result);
  }
}

type ProbeKey = keyof StorageDependencyHealth["tables"];

async function tableResponds(client: TableClient): Promise<boolean> {
  for await (const _entity of client.listEntities()) {
    break;
  }

  return true;
}

export class AzureTableAdminDependencyStore implements AdminDependencyStore {
  private readonly tableClients: Record<ProbeKey, TableClient>;

  constructor(config: TraceOpsConfig) {
    this.tableClients = {
      workItems: TableClient.fromConnectionString(config.storageConnectionString, config.workItemsTableName),
      workItemEvents: TableClient.fromConnectionString(config.storageConnectionString, config.workItemEventsTableName),
      users: TableClient.fromConnectionString(config.storageConnectionString, config.usersTableName),
      tenants: TableClient.fromConnectionString(config.storageConnectionString, config.tenantsTableName),
      tenantMembers: TableClient.fromConnectionString(config.storageConnectionString, config.tenantMembersTableName),
      apiKeys: TableClient.fromConnectionString(config.storageConnectionString, config.apiKeysTableName)
    };
  }

  async getStorageHealth(): Promise<StorageDependencyHealth> {
    const results = await Promise.all(
      (Object.entries(this.tableClients) as [ProbeKey, TableClient][]).map(async ([key, client]) => {
        try {
          await tableResponds(client);
          return [key, true] as const;
        } catch {
          return [key, false] as const;
        }
      })
    );

    const tables = Object.fromEntries(results) as StorageDependencyHealth["tables"];

    return {
      status: Object.values(tables).every(Boolean) ? "ok" : "degraded",
      tables
    };
  }
}

export function requestMetricsFromLogsResult(result: LogsQuerySuccess): RequestMetrics {
  if (result.status !== LogsQueryResultStatus.Success) {
    throw new Error("Application Insights request metrics query failed");
  }

  const row = result.tables?.[0]?.rows[0] ?? [];

  return {
    requestsToday: wholeMetric(row[0]),
    requestsLast7Days: wholeMetric(row[1]),
    failedRequests: wholeMetric(row[2]),
    averageResponseDurationMs: finiteMetric(row[3])
  };
}

export class AdminMetricsService {
  constructor(
    private readonly users: UserStore,
    private readonly workItems: WorkItemStore,
    private readonly requestTelemetry?: RequestTelemetryStore,
    private readonly logAnalyticsWorkspaceId?: string,
    private readonly dependencies?: AdminDependencyStore,
    private readonly config?: Pick<
      TraceOpsConfig,
      | "apiKey"
      | "apiKeyHashSecret"
      | "storageConnectionString"
      | "workItemsTableName"
      | "workItemEventsTableName"
      | "usersTableName"
      | "tenantsTableName"
      | "tenantMembersTableName"
      | "apiKeysTableName"
    >
  ) {}

  async assertAdminUser(userKey: string): Promise<void> {
    try {
      const user = await this.users.getUser(userKey);
      if (!user.isAdmin) {
        throw new AdminAccessDeniedError();
      }
    } catch (error) {
      if (error instanceof AdminAccessDeniedError) {
        throw error;
      }

      if (isStorageNotFound(error)) {
        throw new AdminAccessDeniedError();
      }

      throw error;
    }
  }

  async getUserMetrics(now = new Date()): Promise<UserMetrics> {
    const users = await this.users.listUsers();
    const last7Days = daysAgo(7, now);
    const last30Days = daysAgo(30, now);

    return {
      totalUsers: users.length,
      githubUsers: users.filter((user) => user.identityProvider.toLowerCase() === "github").length,
      microsoftUsers: users.filter(providerIsMicrosoft).length,
      adminUsers: users.filter((user) => user.isAdmin).length,
      usersCreatedLast7Days: users.filter((user) => isAtOrAfter(user.createdAtUtc, last7Days)).length,
      activeUsersLast30Days: users.filter((user) => isAtOrAfter(user.lastLoginAtUtc, last30Days)).length
    };
  }

  async getIssueMetrics(now = new Date()): Promise<IssueMetrics> {
    const issues = (await this.workItems.listAllWorkItems(10000))
      .map(toWorkItem)
      .filter((workItem) => workItem.workItemType === "Issue");
    const last7Days = daysAgo(7, now);

    return {
      totalIssues: issues.length,
      openIssues: issues.filter((workItem) => isOpen(workItem)).length,
      fixedIssues: issues.filter((workItem) => workItem.status === "Fixed").length,
      closedIssues: issues.filter((workItem) => workItem.status === "Closed").length,
      issuesCreatedLast7Days: issues.filter((workItem) => isAtOrAfter(workItem.createdAt, last7Days)).length
    };
  }

  async getRequestMetrics(): Promise<RequestMetrics> {
    if (!this.requestTelemetry || !this.logAnalyticsWorkspaceId) {
      throw new Error("TRACEOPS_LOG_ANALYTICS_WORKSPACE_ID is required");
    }

    return this.requestTelemetry.getRequestMetrics(this.logAnalyticsWorkspaceId);
  }

  async getHealth(now = new Date()): Promise<AdminHealth> {
    const [storage, telemetry, runtimeConfig] = await Promise.all([
      this.getStorageHealth(),
      Promise.resolve(this.getTelemetryHealth()),
      Promise.resolve(this.getRuntimeConfigHealth())
    ]);

    return {
      status:
        storage.status === "ok" && telemetry.status === "ok" && runtimeConfig.status === "ok"
          ? "ok"
          : "degraded",
      checkedAtUtc: now.toISOString(),
      storage,
      telemetry,
      runtimeConfig
    };
  }

  async getDiagnostics(now = new Date()): Promise<AdminDiagnostics> {
    const health = await this.getHealth(now);
    const runtimeConfig = this.getRuntimeConfigHealth();
    const requestMetrics =
      this.requestTelemetry && this.logAnalyticsWorkspaceId
        ? await this.requestTelemetry.getRequestMetrics(this.logAnalyticsWorkspaceId).catch(() => null)
        : null;

    return {
      checkedAtUtc: now.toISOString(),
      health,
      requestMetrics,
      dependencies: {
        storageTables: {
          workItems: this.config?.workItemsTableName || "",
          workItemEvents: this.config?.workItemEventsTableName || "",
          users: this.config?.usersTableName || "",
          tenants: this.config?.tenantsTableName || "",
          tenantMembers: this.config?.tenantMembersTableName || "",
          apiKeys: this.config?.apiKeysTableName || ""
        },
        logAnalyticsWorkspaceConfigured: Boolean(this.logAnalyticsWorkspaceId),
        requiredRuntimeConfigResolved:
          runtimeConfig.apiKeyResolved &&
          runtimeConfig.apiKeyHashSecretResolved &&
          runtimeConfig.storageConnectionStringResolved
      }
    };
  }

  private async getStorageHealth(): Promise<StorageDependencyHealth> {
    if (!this.dependencies) {
      return {
        status: "degraded",
        tables: {
          workItems: false,
          workItemEvents: false,
          users: false,
          tenants: false,
          tenantMembers: false,
          apiKeys: false
        }
      };
    }

    return this.dependencies.getStorageHealth();
  }

  private getTelemetryHealth(): TelemetryDependencyHealth {
    return {
      status: this.logAnalyticsWorkspaceId ? "ok" : "degraded",
      logAnalyticsWorkspaceConfigured: Boolean(this.logAnalyticsWorkspaceId)
    };
  }

  private getRuntimeConfigHealth(): RuntimeConfigHealth {
    return {
      status:
        this.config?.apiKey && this.config.apiKeyHashSecret && this.config.storageConnectionString
          ? "ok"
          : "degraded",
      apiKeyResolved: Boolean(this.config?.apiKey),
      apiKeyHashSecretResolved: Boolean(this.config?.apiKeyHashSecret),
      storageConnectionStringResolved: Boolean(this.config?.storageConnectionString)
    };
  }
}

function isOpen(workItem: WorkItem): boolean {
  return workItem.status !== "Fixed" && workItem.status !== "Closed" && workItem.status !== "WontFix";
}
