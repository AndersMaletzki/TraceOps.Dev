import { WorkItem } from "./types.js";

type FetchFunction = typeof fetch;

export type SearchWorkItemsInput = {
  tenantId: string;
  repoId: string;
  status?: string;
  severity?: string;
  workItemType?: string;
  category?: string;
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

  constructor(
    apiBaseUrl: string,
    private readonly apiKey: string,
    private readonly fetchFn: FetchFunction = fetch
  ) {
    this.baseUrl = new URL(apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`);
    this.authHeaders = this.buildAuthHeaders(apiKey);
  }

  async createWorkItem(input: unknown): Promise<WorkItem> {
    return this.request<WorkItem>("workitems", {
      method: "POST",
      body: input
    });
  }

  async searchWorkItems(input: SearchWorkItemsInput): Promise<{ items: WorkItem[]; count: number }> {
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

  async getNextWorkItem(input: SearchWorkItemsInput): Promise<WorkItem> {
    return this.request<WorkItem>(`workitems/next${this.toQuery(input)}`, {
      method: "GET"
    });
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
