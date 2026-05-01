targetScope = 'resourceGroup'

@description('Azure region for TraceOps resources.')
param location string = resourceGroup().location

@description('Deployment environment name.')
param environmentName string = 'prod'

@description('API key used by the Function App.')
@secure()
param traceOpsApiKey string

@description('Optional principal object ID for TraceOps app deployment identity.')
param appDeploymentPrincipalObjectId string = ''

@description('Work items table name.')
param workItemsTableName string = 'WorkItems'

@description('Work item events table name.')
param workItemEventsTableName string = 'WorkItemEvents'

var suffix = take(uniqueString(subscription().id, resourceGroup().id, environmentName), 6)
var normalizedEnvironmentName = toLower(replace(environmentName, '-', ''))
var storageAccountName = take('sttraceops${normalizedEnvironmentName}${suffix}', 24)
var functionAppName = 'func-traceops-${environmentName}-${suffix}'
var appServicePlanName = 'asp-traceops-${environmentName}-${suffix}'
var logAnalyticsName = 'log-traceops-${environmentName}-${suffix}'
var appInsightsName = 'appi-traceops-${environmentName}-${suffix}'
var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
var websiteContributorRoleId = 'de139f84-1756-47ae-9be6-808fbbe84772'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    accessTier: 'Hot'
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  name: 'default'
  parent: storageAccount
}

resource workItemsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  name: workItemsTableName
  parent: tableService
}

resource workItemEventsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  name: workItemEventsTableName
  parent: tableService
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  kind: 'functionapp'
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20'
      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'AzureWebJobsStorage'
          value: storageConnectionString
        }
        {
          name: 'TRACEOPS_API_KEY'
          value: traceOpsApiKey
        }
        {
          name: 'TRACEOPS_STORAGE_CONNECTION_STRING'
          value: storageConnectionString
        }
        {
          name: 'TRACEOPS_TABLE_WORKITEMS'
          value: workItemsTableName
        }
        {
          name: 'TRACEOPS_TABLE_WORKITEM_EVENTS'
          value: workItemEventsTableName
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
      ]
    }
  }
  dependsOn: [
    workItemsTable
    workItemEventsTable
  ]
}

resource traceOpsDeploymentWebsiteContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(appDeploymentPrincipalObjectId)) {
  name: guid(functionApp.id, appDeploymentPrincipalObjectId, websiteContributorRoleId)
  scope: functionApp
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', websiteContributorRoleId)
    principalId: appDeploymentPrincipalObjectId
    principalType: 'ServicePrincipal'
  }
}

output functionAppName string = functionApp.name
output storageAccountName string = storageAccount.name
output workItemsTable string = workItemsTable.name
output workItemEventsTable string = workItemEventsTable.name
