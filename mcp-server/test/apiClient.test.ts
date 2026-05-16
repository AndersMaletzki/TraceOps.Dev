import { describe, expect, it, vi } from "vitest";
import { TraceOpsApiClient } from "../src/apiClient.js";

const testRawApiKey = "local-dev-key";
const testPersonalApiKey = "trc_live_abc123def456_secret";

describe("TraceOpsApiClient", () => {
  it("shapes search requests with tenant, repo, filters, limit, and API key", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ items: [], count: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    const client = new TraceOpsApiClient("http://localhost:7071/api", testRawApiKey, fetchMock as unknown as typeof fetch);
    await client.searchWorkItems({
      tenantId: "tenant",
      repoId: "repo",
      status: "New",
      severity: "High",
      workItemType: "AuditFinding",
      limit: 10
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL | RequestInfo,
      RequestInit | undefined
    ];
    expect(String(url)).toBe(
      "http://localhost:7071/api/workitems?tenantId=tenant&repoId=repo&status=New&severity=High&workItemType=AuditFinding&limit=10&view=summary"
    );
    expect(init).toMatchObject({
      method: "GET",
      headers: expect.objectContaining({
        "x-api-key": testRawApiKey
      })
    });
  });

  it("gets one work item summary through the summary list path", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          items: [
            {
              workItemId: "ITEM~1",
              repositoryId: "repo",
              title: "Compact",
              status: "New",
              severity: "High",
              workItemType: "Issue",
              category: "Bug",
              assignedToUserKey: "",
              claimedByUserKey: "",
              createdAt: "2026-05-01T00:00:00.000Z",
              updatedAt: "2026-05-01T00:00:00.000Z",
              externalLink: ""
            }
          ],
          count: 1
        }),
        { status: 200 }
      );
    });

    const client = new TraceOpsApiClient("http://localhost:7071/api", testPersonalApiKey, fetchMock as unknown as typeof fetch);
    const summary = await client.getWorkItemSummary({
      tenantId: "tenant",
      repoId: "repo",
      workItemId: "ITEM~1"
    });

    expect(summary).toMatchObject({ workItemId: "ITEM~1", title: "Compact" });
    const [url] = fetchMock.mock.calls[0] as unknown as [URL | RequestInfo, RequestInit | undefined];
    expect(String(url)).toBe(
      "http://localhost:7071/api/workitems?tenantId=tenant&repoId=repo&workItemId=ITEM%7E1&limit=50&view=summary"
    );
  });

  it("sends link metadata without performing repository operations", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          workItemId: "ITEM~1",
          workItemType: "Issue",
          category: "Bug",
          title: "Bug",
          severity: "Low",
          status: "New",
          assignedTo: "",
          claimedBy: "",
          claimExpiresAt: "",
          updatedAt: "2026-05-01T00:00:00.000Z",
          externalBranchName: "codex/test",
          externalCommitUrl: "",
          externalPrUrl: ""
        }),
        { status: 200 }
      );
    });

    const client = new TraceOpsApiClient("http://localhost:7071/api", testRawApiKey, fetchMock as unknown as typeof fetch);
    await client.updateWorkItemLinks({
      tenantId: "tenant",
      repoId: "repo",
      workItemId: "ITEM~1",
      externalBranchName: "codex/test"
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL | RequestInfo,
      RequestInit | undefined
    ];
    expect(String(url)).toBe("http://localhost:7071/api/workitems/ITEM~1/links");
    expect(JSON.parse(String(init?.body))).toEqual({
      tenantId: "tenant",
      repoId: "repo",
      externalBranchName: "codex/test"
    });
  });

  it("uses bearer auth for personal API keys", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ items: [], count: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    const client = new TraceOpsApiClient(
      "http://localhost:7071/api",
      testPersonalApiKey,
      fetchMock as unknown as typeof fetch
    );

    await client.searchWorkItems({
      tenantId: "tenant",
      repoId: "repo",
      limit: 10
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      URL | RequestInfo,
      RequestInit | undefined
    ];
    expect(init).toMatchObject({
      method: "GET",
      headers: expect.objectContaining({
        authorization: `Bearer ${testPersonalApiKey}`
      })
    });
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBeUndefined();
  });

  it("flags tenant-scoped access as unsupported when configured with a raw global API key", () => {
    const client = new TraceOpsApiClient("http://localhost:7071/api", testRawApiKey);

    expect(client.authMode).toBe("global");
    expect(client.supportsTenantScopedWorkItemAccess()).toBe(false);
    expect(client.tenantScopedWorkItemAccessError()).toEqual({
      code: "personal_api_key_required",
      message:
        "Tenant-scoped MCP work item tools require TRACEOPS_API_KEY to be a personal API key. Raw global x-api-key access is reserved for backend-owned website routes."
    });
  });

  it("flags tenant-scoped access as supported when configured with a personal API key", () => {
    const client = new TraceOpsApiClient("http://localhost:7071/api", testPersonalApiKey);

    expect(client.authMode).toBe("personal");
    expect(client.supportsTenantScopedWorkItemAccess()).toBe(true);
  });
});
