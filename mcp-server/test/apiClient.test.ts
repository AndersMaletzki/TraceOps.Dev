import { describe, expect, it, vi } from "vitest";
import { TraceOpsApiClient } from "../src/apiClient.js";

const testRawApiKey = "local-dev-key";

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
      limit: 10
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL | RequestInfo,
      RequestInit | undefined
    ];
    expect(String(url)).toBe(
      "http://localhost:7071/api/workitems?tenantId=tenant&repoId=repo&status=New&severity=High&limit=10"
    );
    expect(init).toMatchObject({
      method: "GET",
      headers: expect.objectContaining({
        "x-api-key": testRawApiKey
      })
    });
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
});
