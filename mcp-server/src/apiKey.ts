const sha256HexPattern = /^[a-f0-9]{64}$/;

export function requireSha256Hex(value: string, name: string): string {
  if (!sha256HexPattern.test(value)) {
    throw new Error(`${name} must be a lowercase SHA-256 hex value`);
  }

  return value;
}
