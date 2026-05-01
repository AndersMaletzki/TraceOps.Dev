targetScope = 'subscription'

@description('Azure region for GitHub identity resources.')
param location string = 'westeurope'

@description('Resource group that contains GitHub OIDC identities.')
param resourceGroupName string = 'rg-traceops-github-identities'

@description('GitHub organization or user that owns the repository.')
param githubOwner string

@description('GitHub repository name.')
param repositoryName string

@description('Deployment environment name used in the Azure identity name.')
param environmentName string = 'production'

@description('Branch allowed to deploy production resources.')
param mainBranchName string = 'main'

var normalizedEnvironmentName = toLower(replace(environmentName, '_', '-'))
var identityName = 'id-traceops-github-${normalizedEnvironmentName}'
var contributorRoleDefinitionId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'

resource identityResourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

module githubIdentity 'modules/github-identity.bicep' = {
  name: 'traceops-github-identity'
  scope: identityResourceGroup
  params: {
    location: location
    identityName: identityName
    githubOwner: githubOwner
    repositoryName: repositoryName
    mainBranchName: mainBranchName
  }
}

resource subscriptionContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().id, resourceGroupName, identityName, contributorRoleDefinitionId)
  properties: {
    principalId: githubIdentity.outputs.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', contributorRoleDefinitionId)
  }
}

output clientId string = githubIdentity.outputs.clientId
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
