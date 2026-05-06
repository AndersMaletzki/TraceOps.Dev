targetScope = 'resourceGroup'

@description('Azure region for TraceOps resources.')
param location string = resourceGroup().location

@description('Deployment environment name.')
param environmentName string = 'prod'

@description('Lowercase SHA-256 hex API key hash used by the Function App.')
@secure()
param traceOpsApiKey string

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

var suffix = take(uniqueString(subscription().id, resourceGroup().id, environmentName), 6)
var normalizedEnvironmentName = toLower(replace(environmentName, '-', ''))
var storageAccountName = take('sttraceops${normalizedEnvironmentName}${suffix}', 24)
var functionAppName = 'func-traceops-${environmentName}-${suffix}'
var appServicePlanName = 'asp-traceops-${environmentName}-${suffix}'
var logAnalyticsName = 'log-traceops-${environmentName}-${suffix}'
var appInsightsName = 'appi-traceops-${environmentName}-${suffix}'
var deploymentStorageContainerName = 'func-traceops-${normalizedEnvironmentName}-${suffix}-packages'
var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
var websiteContributorRoleId = 'de139f84-1756-47ae-9be6-808fbbe84772'
var logAnalyticsDataReaderRoleId = '3b03c2da-16b3-4a49-8834-0f8130efdd3b'

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

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  name: 'default'
  parent: storageAccount
}

resource deploymentStorageContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: deploymentStorageContainerName
  parent: blobService
  properties: {
    publicAccess: 'None'
  }
}

resource workItemsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  name: workItemsTableName
  parent: tableService
}

resource workItemEventsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  name: workItemEventsTableName
  parent: tableService
}

resource usersTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  name: usersTableName
  parent: tableService
}

resource tenantsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  name: tenantsTableName
  parent: tableService
}

resource tenantMembersTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  name: tenantMembersTableName
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

resource appServicePlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  kind: 'functionapp'
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageAccount.properties.primaryEndpoints.blob}${deploymentStorageContainerName}'
          authentication: {
            type: 'StorageAccountConnectionString'
            storageAccountConnectionStringName: 'DEPLOYMENT_STORAGE_CONNECTION_STRING'
          }
        }
      }
      runtime: {
        name: 'node'
        version: '20'
      }
      scaleAndConcurrency: {
        instanceMemoryMB: 512
        maximumInstanceCount: 20
      }
    }
    siteConfig: {
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: storageConnectionString
        }
        {
          name: 'DEPLOYMENT_STORAGE_CONNECTION_STRING'
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
          name: 'TRACEOPS_TABLE_USERS'
          value: usersTableName
        }
        {
          name: 'TRACEOPS_TABLE_TENANTS'
          value: tenantsTableName
        }
        {
          name: 'TRACEOPS_TABLE_TENANT_MEMBERS'
          value: tenantMembersTableName
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'TRACEOPS_LOG_ANALYTICS_WORKSPACE_ID'
          value: logAnalytics.properties.customerId
        }
      ]
    }
  }
  dependsOn: [
    deploymentStorageContainer
    workItemsTable
    workItemEventsTable
    usersTable
    tenantsTable
    tenantMembersTable
  ]
}

resource traceOpsFunctionLogAnalyticsDataReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(logAnalytics.id, functionApp.id, logAnalyticsDataReaderRoleId)
  scope: logAnalytics
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', logAnalyticsDataReaderRoleId)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
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
output usersTable string = usersTable.name
output tenantsTable string = tenantsTable.name
output tenantMembersTable string = tenantMembersTable.name
