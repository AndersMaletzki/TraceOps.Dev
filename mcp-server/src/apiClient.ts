import { WorkItem, WorkItemSummary } from "./types.js";

type FetchFunction = typeof fetch;

const severityRank: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Info: 4
};

export type SearchWorkItemsInput = {
  tenantId: string;
  repoId: string;
  status?: string;
  severity?: string;
  workItemType?: string;
  category?: string;
  workItemId?: string;
  limit?: number;
};

export class TraceOpsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "TraceOpsApiError";
  }
}

export class TraceOpsApiClient {
  private readonly baseUrl: URL;
  private readonly authHeaders: Record<string, string>;
  readonly authMode: "global" | "personal";

  constructor(
    apiBaseUrl: string,
    private readonly apiKey: string,
    private readonly fetchFn: FetchFunction = fetch
  ) {
    this.baseUrl = new URL(apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`);
    this.authMode = this.apiKey.startsWith("trc_") ? "personal" : "global";
    this.authHeaders = this.buildAuthHeaders(apiKey);
  }

  async createWorkItem(input: unknown): Promise<WorkItem> {
    return this.request<WorkItem>("workitems", {
      method: "POST",
      body: input
    });
  }

  async searchWorkItems(input: SearchWorkItemsInput): Promise<{ items: WorkItemSummary[]; count: number }> {
    return this.request<{ items: WorkItemSummary[]; count: number }>(
      `workitems${this.toQuery({ ...input, view: "summary" })}`,
      {
        method: "GET"
      }
    );
  }

  async getActiveWorkItems(input: Omit<SearchWorkItemsInput, "status">): Promise<{ items: WorkItemSummary[]; count: number }> {
    const activeStatuses = ["New", "Accepted", "Claimed", "InProgress", "InReview"];
    const responses = await Promise.all(
      activeStatuses.map((status) => this.searchWorkItems({ ...input, status }))
    );
    const items = responses
      .flatMap((response) => response.items)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, input.limit || 10);

    return { items, count: items.length };
  }

  async getRecentWorkItems(input: SearchWorkItemsInput): Promise<{ items: WorkItemSummary[]; count: number }> {
    const response = await this.searchWorkItems(input);
    const items = response.items
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, input.limit || 10);

    return { items, count: items.length };
  }

  async getWorkItemSummary(input: { tenantId: string; repoId: string; workItemId: string }): Promise<WorkItemSummary> {
    const response = await this.searchWorkItems({
      tenantId: input.tenantId,
      repoId: input.repoId,
      workItemId: input.workItemId,
      limit: 50
    });
    const summary = response.items.find((item) => item.workItemId === input.workItemId);

    if (!summary) {
      throw new TraceOpsApiError(`Work item summary not found: ${input.workItemId}`, 404);
    }

    return summary;
  }

  async searchWorkItemDetails(input: SearchWorkItemsInput): Promise<{ items: WorkItem[]; count: number }> {
    return this.request<{ items: WorkItem[]; count: number }>(`workitems${this.toQuery(input)}`, {
      method: "GET"
    });
  }

  async getWorkItem(input: { tenantId: string; repoId: string; workItemId: string }): Promise<WorkItem> {
    return this.request<WorkItem>(
      `workitems/${encodeURIComponent(input.workItemId)}${this.toQuery({
        tenantId: input.tenantId,
        repoId: input.repoId
      })}`,
      { method: "GET" }
    );
  }

  async getNextWorkItem(input: SearchWorkItemsInput): Promise<WorkItemSummary> {
    const candidateStatuses = input.status ? [input.status] : ["New", "Accepted"];
    const responses = await Promise.all(
      candidateStatuses.map((status) => this.searchWorkItems({ ...input, status }))
    );
    const next = responses
      .flatMap((response) => response.items)
      .sort((left, right) => {
        const severityDifference = severityRank[left.severity] - severityRank[right.severity];
        return severityDifference === 0 ? left.createdAt.localeCompare(right.createdAt) : severityDifference;
      })[0];

    if (!next) {
      throw new TraceOpsApiError("No actionable work item found", 404);
    }

    return next;
  }

  async updateWorkItemStatus(input: {
    tenantId: string;
    repoId: string;
    workItemId: string;
    status: string;
    actor: string;
  }): Promise<WorkItem> {
    return this.request<WorkItem>(`workitems/${encodeURIComponent(input.workItemId)}/status`, {
      method: "PATCH",
      body: {
        tenantId: input.tenantId,
        repoId: input.repoId,
        status: input.status,
        actor: input.actor
      }
    });
  }

  async claimWorkItem(input: {
    tenantId: string;
    repoId: string;
    workItemId: string;
    claimedBy: string;
    claimDurationMinutes?: number;
  }): Promise<WorkItem> {
    return this.request<WorkItem>(`workitems/${encodeURIComponent(input.workItemId)}/claim`, {
      method: "PATCH",
      body: {
        tenantId: input.tenantId,
        repoId: input.repoId,
        claimedBy: input.claimedBy,
        claimDurationMinutes: input.claimDurationMinutes
      }
    });
  }

  async updateWorkItemLinks(input: {
    tenantId: string;
    repoId: string;
    workItemId: string;
    externalBranchName?: string;
    externalCommitUrl?: string;
    externalPrUrl?: string;
  }): Promise<WorkItem> {
    return this.request<WorkItem>(`workitems/${encodeURIComponent(input.workItemId)}/links`, {
      method: "PATCH",
      body: {
        tenantId: input.tenantId,
        repoId: input.repoId,
        externalBranchName: input.externalBranchName,
        externalCommitUrl: input.externalCommitUrl,
        externalPrUrl: input.externalPrUrl
      }
    });
  }

  supportsTenantScopedWorkItemAccess(): boolean {
    return this.authMode === "personal";
  }

  tenantScopedWorkItemAccessError(): { code: string; message: string } {
    return {
      code: "personal_api_key_required",
      message:
        "Tenant-scoped MCP work item tools require TRACEOPS_API_KEY to be a personal API key. Raw global x-api-key access is reserved for backend-owned website routes."
    };
  }

  private toQuery(input: Record<string, string | number | undefined>): string {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    }

    const serialized = params.toString();
    return serialized ? `?${serialized}` : "";
  }

  private async request<T>(path: string, options: { method: string; body?: unknown }): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const response = await this.fetchFn(url, {
      method: options.method,
      headers: {
        "content-type": "application/json",
        ...this.authHeaders
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    const responseBody = await response.text();
    const parsedBody = responseBody ? JSON.parse(responseBody) : undefined;

    if (!response.ok) {
      const message =
        typeof parsedBody === "object" && parsedBody !== null && "error" in parsedBody
          ? String(parsedBody.error)
          : `TraceOps API request failed with status ${response.status}`;
      throw new TraceOpsApiError(message, response.status);
    }

    return parsedBody as T;
  }

  private buildAuthHeaders(apiKey: string): Record<string, string> {
    if (apiKey.startsWith("trc_")) {
      return {
        authorization: `Bearer ${apiKey}`
      };
    }

    return {
      "x-api-key": apiKey
    };
  }
}
