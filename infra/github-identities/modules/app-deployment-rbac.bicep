targetScope = 'resourceGroup'

@description('Object ID of the app deployment service principal.')
param appDeploymentPrincipalId string

var readerRoleDefinitionGuid = 'acdd72a7-3385-48ef-bd42-f606fba81ae7c'
var websiteContributorRoleDefinitionGuid = 'de139f84-1756-47ae-9be6-808fbbe84772'

var readerRoleDefinitionId = '/subscriptions/${subscription().subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${readerRoleDefinitionGuid}'
var websiteContributorRoleDefinitionId = '/subscriptions/${subscription().subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${websiteContributorRoleDefinitionGuid}'

resource appDeploymentReaderAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, appDeploymentPrincipalId, readerRoleDefinitionGuid)
  properties: {
    principalId: appDeploymentPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: readerRoleDefinitionId
  }
}

resource appDeploymentWebsiteContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, appDeploymentPrincipalId, websiteContributorRoleDefinitionGuid)
  properties: {
    principalId: appDeploymentPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: websiteContributorRoleDefinitionId
  }
}
