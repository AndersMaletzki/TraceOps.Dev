targetScope = 'resourceGroup'

@description('Object ID of the app deployment service principal.')
param appDeploymentPrincipalId string

var readerRoleDefinitionId = 'acdd72a7-3385-48ef-bd42-f606fba81ae7c'
var websiteContributorRoleDefinitionId = 'de139f84-1756-47ae-9be6-808fbbe84772'

resource appDeploymentReaderAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, appDeploymentPrincipalId, readerRoleDefinitionId)
  properties: {
    principalId: appDeploymentPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', readerRoleDefinitionId)
  }
}

resource appDeploymentWebsiteContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, appDeploymentPrincipalId, websiteContributorRoleDefinitionId)
  properties: {
    principalId: appDeploymentPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', websiteContributorRoleDefinitionId)
  }
}
