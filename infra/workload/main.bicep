targetScope = 'subscription'

// TODO: Define workload infrastructure.
// Recommended pattern:
// - create resource group
// - call workload module scoped to the resource group
// - output important resource names and URLs

param location string = 'westeurope'
param resourceGroupName string
param environmentName string = 'prod'
