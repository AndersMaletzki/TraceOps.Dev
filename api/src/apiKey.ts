import { timingSafeEqual } from "node:crypto";

const sha256HexPattern = /^[a-f0-9]{64}$/;

export function isSha256Hex(value: string): boolean {
  return sha256HexPattern.test(value);
}

export function requireSha256Hex(value: string, name: string): string {
  if (!isSha256Hex(value)) {
    throw new Error(`${name} must be a lowercase SHA-256 hex value`);
  }

  return value;
}

export function apiKeysMatch(suppliedApiKey: string, expectedApiKey: string): boolean {
  if (!isSha256Hex(suppliedApiKey) || !isSha256Hex(expectedApiKey)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(suppliedApiKey, "hex"), Buffer.from(expectedApiKey, "hex"));
}
