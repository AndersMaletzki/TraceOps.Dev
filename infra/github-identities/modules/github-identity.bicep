targetScope = 'resourceGroup'

@description('Azure region for the GitHub Actions managed identity.')
param location string = resourceGroup().location

@description('Managed identity name used by GitHub Actions OIDC.')
param identityName string

@description('GitHub organization or user that owns the repository.')
param githubOwner string

@description('GitHub repository name.')
param repositoryName string

@description('Branch allowed to deploy production resources.')
param mainBranchName string = 'main'

var githubIssuer = 'https://token.actions.githubusercontent.com'
var azureTokenExchangeAudience = [
  'api://AzureADTokenExchange'
]

resource githubActionsIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

resource mainBranchCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  name: 'github-main'
  parent: githubActionsIdentity
  properties: {
    issuer: githubIssuer
    subject: 'repo:${githubOwner}/${repositoryName}:ref:refs/heads/${mainBranchName}'
    audiences: azureTokenExchangeAudience
  }
}

resource pullRequestCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  name: 'github-pull-request'
  parent: githubActionsIdentity
  properties: {
    issuer: githubIssuer
    subject: 'repo:${githubOwner}/${repositoryName}:pull_request'
    audiences: azureTokenExchangeAudience
  }
}

output clientId string = githubActionsIdentity.properties.clientId
output principalId string = githubActionsIdentity.properties.principalId
output identityResourceId string = githubActionsIdentity.id
