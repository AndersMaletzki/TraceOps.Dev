import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const sha256HexPattern = /^[a-f0-9]{64}$/;
const personalApiKeyPattern = /^trc_live_([a-f0-9]{12})_([A-Za-z0-9_-]{43})$/;

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

export function generatePersonalApiKey(): string {
  const prefix = randomBytes(6).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  return `trc_live_${prefix}_${secret}`;
}

export function parsePersonalApiKey(value: string): { keyPrefix: string; secret: string } | undefined {
  const match = personalApiKeyPattern.exec(value.trim());

  if (!match) {
    return undefined;
  }

  return {
    keyPrefix: match[1],
    secret: match[2]
  };
}

export function hashPersonalApiKey(value: string, hashSecret: string): string {
  return createHmac("sha256", hashSecret).update(value).digest("hex");
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

export function personalApiKeyHashesMatch(
  suppliedApiKey: string,
  expectedApiKeyHash: string,
  hashSecret: string
): boolean {
  if (!suppliedApiKey || !expectedApiKeyHash) {
    return false;
  }

  return safeCompare(hashPersonalApiKey(suppliedApiKey, hashSecret), normalizeHash(expectedApiKeyHash));
}
