targetScope = 'subscription'

@description('Azure region for TraceOps resources.')
param location string = 'westeurope'

@description('Resource group name for the workload.')
param resourceGroupName string = 'rg-traceops-prod'

@description('Deployment environment name.')
param environmentName string = 'prod'

@description('Lowercase SHA-256 hex API key hash used by the Function App. Store the hash in GitHub Secrets or Key Vault.')
@secure()
param traceOpsApiKey string

@description('Secret used to HMAC personal API keys before storing them in Table Storage. Store this in GitHub Secrets or Key Vault.')
@secure()
param traceOpsApiKeyHashSecret string

@description('Optional principal object ID for TraceOps app deployment identity.')
param appDeploymentPrincipalObjectId string = ''

@description('Work items table name.')
param workItemsTableName string = 'WorkItems'

@description('Work item events table name.')
param workItemEventsTableName string = 'WorkItemEvents'

@description('Users table name.')
param usersTableName string = 'TraceOpsUsers'

@description('Tenants table name.')
param tenantsTableName string = 'TraceOpsTenants'

@description('Tenant members table name.')
param tenantMembersTableName string = 'TraceOpsTenantMembers'

@description('API keys table name.')
param apiKeysTableName string = 'TraceOpsApiKeys'

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

module workload 'modules/workload.bicep' = {
  name: 'traceops-workload'
  scope: resourceGroup
  params: {
    location: location
    environmentName: environmentName
    traceOpsApiKey: traceOpsApiKey
    traceOpsApiKeyHashSecret: traceOpsApiKeyHashSecret
    appDeploymentPrincipalObjectId: appDeploymentPrincipalObjectId
    workItemsTableName: workItemsTableName
    workItemEventsTableName: workItemEventsTableName
    usersTableName: usersTableName
    tenantsTableName: tenantsTableName
    tenantMembersTableName: tenantMembersTableName
    apiKeysTableName: apiKeysTableName
  }
}

output functionAppName string = workload.outputs.functionAppName
output resourceGroup string = resourceGroup.name
output storageAccountName string = workload.outputs.storageAccountName
output workItemsTable string = workload.outputs.workItemsTable
output workItemEventsTable string = workload.outputs.workItemEventsTable
output usersTable string = workload.outputs.usersTable
output tenantsTable string = workload.outputs.tenantsTable
output tenantMembersTable string = workload.outputs.tenantMembersTable
output apiKeysTable string = workload.outputs.apiKeysTable
