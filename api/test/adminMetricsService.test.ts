import { describe, expect, it } from "vitest";
import {
  AdminAccessDeniedError,
  AdminMetricsService,
  requestMetricsFromLogsResult
} from "../src/adminMetricsService.js";
import { CreateWorkItemInput, TraceOpsUser } from "../src/domain.js";
import { StoredWorkItemResult, toStoredWorkItem } from "../src/storage.js";

const now = new Date("2026-05-05T12:00:00.000Z");

function user(overrides: Partial<TraceOpsUser>): TraceOpsUser {
  return {
    userKey: "github|1",
    identityProvider: "github",
    providerUserId: "1",
    userDetails: "octocat@example.com",
    displayName: "Octo Cat",
    createdAtUtc: "2026-05-05T12:00:00.000Z",
    lastLoginAtUtc: "2026-05-05T12:00:00.000Z",
    loginCount: 1,
    isAdmin: false,
    ...overrides
  };
}

function workItem(overrides: Partial<CreateWorkItemInput> = {}, createdAt = "2026-05-05T12:00:00.000Z"): StoredWorkItemResult {
  return {
    ...toStoredWorkItem(
      {
        tenantId: "tenant",
        repoId: "repo",
        workItemType: "Issue",
        category: "Bug",
        title: "Broken API",
        description: "The API returns a bad response.",
        severity: "High",
        status: "New",
        source: "audit",
        createdBy: "codex",
        ...overrides
      },
      `ITEM~${createdAt.replace(/\D/g, "").slice(0, 14)}~abc123`,
      createdAt
    ),
    etag: "etag"
  };
}

describe("AdminMetricsService", () => {
  it("aggregates user product metrics", async () => {
    const service = new AdminMetricsService(
      {
        getUser: async () => user({ isAdmin: true }),
        listUsers: async () => [
          user({ userKey: "github|1", identityProvider: "github", isAdmin: true }),
          user({
            userKey: "aad|2",
            identityProvider: "aad",
            createdAtUtc: "2026-04-01T12:00:00.000Z",
            lastLoginAtUtc: "2026-04-01T12:00:00.000Z"
          })
        ]
      },
      { listAllWorkItems: async () => [] }
    );

    await expect(service.getUserMetrics(now)).resolves.toEqual({
      totalUsers: 2,
      githubUsers: 1,
      microsoftUsers: 1,
      adminUsers: 1,
      usersCreatedLast7Days: 1,
      activeUsersLast30Days: 1
    });
  });

  it("aggregates issue product metrics from work items", async () => {
    const service = new AdminMetricsService(
      { getUser: async () => user({ isAdmin: true }), listUsers: async () => [] },
      {
        listAllWorkItems: async () => [
          workItem({ status: "New" }),
          workItem({ status: "Fixed" }),
          workItem({ status: "Closed" }, "2026-04-01T12:00:00.000Z")
        ]
      }
    );

    await expect(service.getIssueMetrics(now)).resolves.toEqual({
      totalIssues: 3,
      openIssues: 1,
      fixedIssues: 1,
      closedIssues: 1,
      issuesCreatedLast7Days: 2
    });
  });

  it("counts only Issue work items in issue metrics", async () => {
    const service = new AdminMetricsService(
      { getUser: async () => user({ isAdmin: true }), listUsers: async () => [] },
      {
        listAllWorkItems: async () => [
          workItem({ workItemType: "Issue", status: "New" }),
          workItem({ workItemType: "Feature", status: "Closed" }),
          workItem({ workItemType: "AuditFinding", status: "Fixed" }),
          workItem({ workItemType: "Issue", status: "Closed" }, "2026-04-01T12:00:00.000Z")
        ]
      }
    );

    await expect(service.getIssueMetrics(now)).resolves.toEqual({
      totalIssues: 2,
      openIssues: 1,
      fixedIssues: 0,
      closedIssues: 1,
      issuesCreatedLast7Days: 1
    });
  });

  it("aggregates request metrics from Application Insights telemetry", async () => {
    const service = new AdminMetricsService(
      { getUser: async () => user({ isAdmin: true }), listUsers: async () => [] },
      { listAllWorkItems: async () => [] },
      {
        getRequestMetrics: async () => ({
          requestsToday: 12,
          requestsLast7Days: 42,
          failedRequests: 3,
          averageResponseDurationMs: 128.5
        })
      },
      "workspace-id"
    );

    await expect(service.getRequestMetrics()).resolves.toEqual({
      requestsToday: 12,
      requestsLast7Days: 42,
      failedRequests: 3,
      averageResponseDurationMs: 128.5
    });
  });

  it("maps request metrics from Application Insights query results", () => {
    expect(requestMetricsFromLogsResult({ status: "Success", tables: [{ rows: [[12, 42, 3, 128.5]] }] })).toEqual({
      requestsToday: 12,
      requestsLast7Days: 42,
      failedRequests: 3,
      averageResponseDurationMs: 128.5
    });
  });

  it("normalizes empty request telemetry to zero metrics", () => {
    expect(requestMetricsFromLogsResult({ status: "Success", tables: [{ rows: [[0, 0, 0, null]] }] })).toEqual({
      requestsToday: 0,
      requestsLast7Days: 0,
      failedRequests: 0,
      averageResponseDurationMs: 0
    });

    expect(requestMetricsFromLogsResult({ status: "Success", tables: [] })).toEqual({
      requestsToday: 0,
      requestsLast7Days: 0,
      failedRequests: 0,
      averageResponseDurationMs: 0
    });
  });

  it("rejects partial request telemetry query results", () => {
    expect(() => requestMetricsFromLogsResult({ status: "PartialFailure", tables: [] })).toThrow(
      "Application Insights request metrics query failed"
    );
  });

  it("rejects non-admin callers for admin metrics authorization", async () => {
    const service = new AdminMetricsService(
      { getUser: async () => user({ isAdmin: false }), listUsers: async () => [] },
      { listAllWorkItems: async () => [] }
    );

    await expect(service.assertAdminUser("github|1")).rejects.toThrow(AdminAccessDeniedError);
  });
});
