import { requireSha256Hex } from "./apiKey.js";

export type TraceOpsMcpConfig = {
  apiBaseUrl: string;
  apiKey: string;
};

export function getConfig(env: NodeJS.ProcessEnv = process.env): TraceOpsMcpConfig {
  const apiBaseUrl = env.TRACEOPS_API_BASE_URL;
  const apiKey = env.TRACEOPS_API_KEY;

  if (!apiBaseUrl) {
    throw new Error("TRACEOPS_API_BASE_URL is required");
  }

  if (!apiKey) {
    throw new Error("TRACEOPS_API_KEY is required");
  }

  return {
    apiBaseUrl,
    apiKey: requireSha256Hex(apiKey, "TRACEOPS_API_KEY")
  };
}
