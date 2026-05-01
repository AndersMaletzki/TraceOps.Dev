targetScope = 'subscription'

@description('Azure region for TraceOps resources.')
param location string = 'westeurope'

@description('Resource group name for the workload.')
param resourceGroupName string = 'rg-traceops-prod'

@description('Deployment environment name.')
param environmentName string = 'prod'

@description('API key used by the Function App. Store the source value in GitHub Secrets or Key Vault.')
@secure()
param traceOpsApiKey string

@description('Work items table name.')
param workItemsTableName string = 'WorkItems'

@description('Work item events table name.')
param workItemEventsTableName string = 'WorkItemEvents'

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
    workItemsTableName: workItemsTableName
    workItemEventsTableName: workItemEventsTableName
  }
}

output functionAppName string = workload.outputs.functionAppName
output resourceGroup string = resourceGroup.name
output storageAccountName string = workload.outputs.storageAccountName
output workItemsTable string = workload.outputs.workItemsTable
output workItemEventsTable string = workload.outputs.workItemEventsTable
