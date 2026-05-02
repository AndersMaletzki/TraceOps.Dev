# Architecture

TraceOps.Dev v0.1 is a minimal coordination service for AI agents working on repository audits and operational workflows.

It persists structured issues, features, audit findings, and workflow state. It does not modify repositories or perform autonomous git operations.

## v0.1 Architecture

```text
Codex / AI Agent
  -> MCP Server
  -> TraceOps API
  -> Azure Table Storage
```

## Components

| Component | Technology | Purpose |
|---|---|---|
| API | TypeScript + Azure Functions | Validates requests, enforces API key auth, and reads/writes work items |
| Storage | Azure Table Storage | Stores work items and append-only work item events |
| MCP Server | TypeScript + official MCP SDK | Exposes concise agent tools that call the API |
| Infrastructure | Bicep | Defines Azure workload resources |
| GitHub Actions | OIDC + Azure CLI | Validates, previews, and deploys infra/app changes |

## Scope

TraceOps.Dev v0.1 supports:

- issue tracking
- feature tracking
- audit finding tracking
- workflow state tracking for AI agents

TraceOps.Dev v0.1 does not support:

- branch creation
- commits or pushes
- PR creation
- repository modification
- billing
- notifications
- analytics
- advanced auth
- GitHub Apps
- dashboards or UI

## API

All endpoints require `x-api-key`. `TRACEOPS_API_KEY` stores the lowercase SHA-256 hash of the API key, and clients send the raw API key as the bearer value. The API hashes the incoming key before comparing.

```text
POST  /workitems
GET   /workitems
GET   /workitems/{workItemId}
GET   /workitems/next
PATCH /workitems/{workItemId}/status
PATCH /workitems/{workItemId}/claim
PATCH /workitems/{workItemId}/links
```

`tenantId` and `repoId` are required for all read/update operations so queries stay inside one Table Storage partition.

## Storage Design

v0.1 uses two Azure Table Storage tables:

- `WorkItems`
- `WorkItemEvents`

Work item keys:

```text
PartitionKey = TENANT~<base64url(tenantId)>~REPO~<base64url(repoId)>
RowKey       = ITEM~<yyyyMMddHHmmss>~<shortId>
```

Status event keys:

```text
PartitionKey = TENANT~<base64url(tenantId)>~REPO~<base64url(repoId)>
RowKey       = EVT~<yyyyMMddHHmmss>~<shortId>
```

`workItemId` is the full work item RowKey. Clients treat it as opaque.

`files` and `tags` are arrays in API and MCP payloads. They are stored as JSON strings in Table Storage.

## Work Item Contract

Allowed work item types:

- `Issue`
- `Feature`

Allowed categories:

- `Security`
- `Bug`
- `Infra`
- `Refactor`
- `Documentation`
- `Performance`
- `TechnicalDebt`
- `Idea`

Allowed severities:

- `Critical`
- `High`
- `Medium`
- `Low`
- `Info`

Allowed statuses:

- `New`
- `Accepted`
- `Claimed`
- `InProgress`
- `InReview`
- `Fixed`
- `Closed`
- `WontFix`

## Coordination Rules

- `GET /workitems` defaults `limit` to `10` and caps it at `50`.
- `GET /workitems/next` defaults to `New` and `Accepted` items, sorted by severity then oldest created time.
- Status updates write append-only `WorkItemEvents` records.
- Claims record `claimedBy`, `claimedAt`, and `claimExpiresAt`.
- Active unexpired claims by another claimant return `409 Conflict`.
- Link updates store only external branch, commit, and PR metadata.

## Deployment

TraceOps.Dev uses two GitHub OIDC app registrations. `AZURE_INFRA_CLIENT_ID` is provisioned by the `azure-bicep-configs` bootstrap and has subscription-level permissions for infrastructure deployment. `AZURE_CLIENT_ID` is provisioned by this monorepo's infrastructure deployment and is used for application deployment.

The app deployment identity receives only resource-group-scoped permissions on `rg-traceops-prod`:

- Reader
- Website Contributor

After infrastructure deployment, the `appDeployClientId` output must be stored as the repository secret `AZURE_CLIENT_ID`.

Pull requests:

```text
npm install
npm run build
npm test
az bicep build
az deployment sub what-if
```

Main branch:

```text
deploy app deployment identity and workload infrastructure
deploy Azure Functions API
```

GitHub Actions use Azure OIDC. Publish profiles are not used.
