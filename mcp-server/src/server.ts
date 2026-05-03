#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TraceOpsApiClient } from "./apiClient.js";
import { getConfig } from "./config.js";
import { registerTraceOpsTools } from "./tools.js";

async function main(): Promise<void> {
  const config = getConfig();
  const server = new McpServer({
    name: "traceops-dev",
    version: "0.1.0"
  });

  registerTraceOpsTools(server, new TraceOpsApiClient(config.apiBaseUrl, config.apiKey), {
    defaultTenantId: config.defaultTenantId
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "TraceOps MCP server failed");
  process.exit(1);
});
