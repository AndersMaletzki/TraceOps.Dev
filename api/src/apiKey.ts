import { createHash, timingSafeEqual } from "node:crypto";

const sha256HexPattern = /^[a-f0-9]{64}$/;

function normalizeHash(value: string): string {
  return value.trim().toLowerCase();
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashApiKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function requireSha256Hex(value: string, name: string): string {
  const normalized = normalizeHash(value);

  if (!sha256HexPattern.test(normalized)) {
    throw new Error(`${name} must be a lowercase SHA-256 hex value`);
  }

  return normalized;
}

export function apiKeysMatch(suppliedApiKey: string, expectedApiKeyHash: string): boolean {
  if (!suppliedApiKey) {
    return false;
  }

  return safeCompare(hashApiKey(suppliedApiKey), normalizeHash(expectedApiKeyHash));
}
