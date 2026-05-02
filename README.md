# TraceOps.Dev

TraceOps.Dev v0.1 is a minimal AI-native issue, feature, audit finding, and workflow state tracker for repository operations.

It proves one workflow:

```text
audit finding or feature request
-> create_workitem
-> search_workitems
-> get_next_workitem
-> claim_workitem
-> update_workitem_status
-> update_workitem_links
```

v0.1 does not create branches, push commits, open PRs, modify repositories, implement billing, notifications, dashboards, GitHub Apps, or advanced auth.

## Structure

```text
api/              Azure Functions HTTP API
mcp-server/       MCP stdio server that calls the API
infra/            Azure Bicep infrastructure
scripts/examples/ Example work item payloads
docs/             Architecture docs
```

## Requirements

- Node.js 20+
- Azure Functions Core Tools v4
- Azurite for local Table Storage, or an Azure Storage connection string
- Azure CLI for Bicep validation/deployment

## Environment

API:

```bash
export TRACEOPS_API_KEY='ed5a18fb8f807f996d649e379d3f35f39c543a91bdbf88c492f2ebd10d4df86c'
export TRACEOPS_STORAGE_CONNECTION_STRING='UseDevelopmentStorage=true'
export TRACEOPS_TABLE_WORKITEMS='WorkItems'
export TRACEOPS_TABLE_WORKITEM_EVENTS='WorkItemEvents'
```

MCP server:

```bash
export TRACEOPS_API_BASE_URL='http://localhost:7071/api'
export TRACEOPS_API_KEY='local-dev-key'
```

For the API, `TRACEOPS_API_KEY` is the lowercase SHA-256 hash of the raw API key. HTTP clients, including the MCP server, authenticate by sending the raw API key in `x-api-key`; the API hashes that incoming value before comparing. The local API hash above is the SHA-256 hash of `local-dev-key`.

## Local Setup

```bash
npm install
npm run build
npm test
cp api/local.settings.sample.json api/local.settings.json
npm run dev:api
```

Run the MCP server after the API is available:

```bash
npm run dev:mcp
```

## API Examples

Create a work item:

```bash
curl -sS -X POST 'http://localhost:7071/api/workitems' \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-dev-key' \
  --data @scripts/examples/create-security-issue.json
```

Search work items:

```bash
curl -sS 'http://localhost:7071/api/workitems?tenantId=demo-tenant&repoId=traceops-dev&limit=10' \
  -H 'x-api-key: local-dev-key'
```

Get the next actionable item:

```bash
curl -sS 'http://localhost:7071/api/workitems/next?tenantId=demo-tenant&repoId=traceops-dev' \
  -H 'x-api-key: local-dev-key'
```

Claim an item:

```bash
curl -sS -X PATCH 'http://localhost:7071/api/workitems/ITEM~20260501153000~abc123def0/claim' \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-dev-key' \
  --data @scripts/examples/claim-workitem.json
```

Update status:

```bash
curl -sS -X PATCH 'http://localhost:7071/api/workitems/ITEM~20260501153000~abc123def0/status' \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-dev-key' \
  --data '{"tenantId":"demo-tenant","repoId":"traceops-dev","status":"InProgress","actor":"codex"}'
```

Store external metadata:

```bash
curl -sS -X PATCH 'http://localhost:7071/api/workitems/ITEM~20260501153000~abc123def0/links' \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-dev-key' \
  --data @scripts/examples/update-links.json
```

The `externalBranchName`, `externalCommitUrl`, and `externalPrUrl` fields are metadata only. TraceOps.Dev v0.1 never performs git operations.

## MCP Usage

Example Codex/Claude MCP config:

```json
{
  "mcpServers": {
    "traceops-dev": {
      "command": "node",
      "args": ["/absolute/path/to/TraceOps.Dev/mcp-server/dist/server.js"],
      "env": {
        "TRACEOPS_API_BASE_URL": "http://localhost:7071/api",
        "TRACEOPS_API_KEY": "local-dev-key"
      }
    }
  }
}
```

Available tools:

- `create_workitem`
- `search_workitems`
- `get_workitem`
- `get_next_workitem`
- `update_workitem_status`
- `claim_workitem`
- `update_workitem_links`

Tool responses are intentionally concise. All tools require `tenantId` and `repoId`.

## Infrastructure

Validate Bicep:

```bash
az bicep build --file infra/github-identities/main.bicep
az bicep build --file infra/workload/main.bicep
```

TraceOps.Dev uses two GitHub OIDC identities:

- `AZURE_INFRA_CLIENT_ID` is the app registration provisioned by the `azure-bicep-configs` bootstrap. It has subscription-level permissions and deploys infrastructure.
- `AZURE_CLIENT_ID` is the app registration provisioned by this monorepo's infrastructure deployment. It is used only for application deployment and receives Reader plus Website Contributor on `rg-traceops-prod`.

After the infrastructure deployment creates the app deployment identity, store the `appDeployClientId` output as the repository secret `AZURE_CLIENT_ID`.

Deploy through GitHub Actions using OIDC. Required repository secrets:

- `AZURE_INFRA_CLIENT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `TRACEOPS_API_KEY` as a lowercase SHA-256 hash value for the API app

The workload Bicep creates:

- app deployment app registration and service principal
- resource group
- Azure Storage account
- `WorkItems` table
- `WorkItemEvents` table
- Linux Azure Function App on Node 20
- Application Insights and Log Analytics

## Data Model

Work items are stored in Azure Table Storage:

```text
PartitionKey = TENANT~<base64url(tenantId)>~REPO~<base64url(repoId)>
RowKey       = ITEM~<yyyyMMddHHmmss>~<shortId>
```

Status events are append-only:

```text
PartitionKey = TENANT~<base64url(tenantId)>~REPO~<base64url(repoId)>
RowKey       = EVT~<yyyyMMddHHmmss>~<shortId>
```
