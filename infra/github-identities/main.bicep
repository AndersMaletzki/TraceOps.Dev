targetScope = 'subscription'

// TODO: Add GitHub OIDC app registration, service principal,
// and federated credential setup.
// This should follow the same pattern as existing projects.

param githubOwner string
param repositoryName string
param environmentName string = 'production'
