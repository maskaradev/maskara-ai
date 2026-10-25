// Deterministic, non-cryptographic hashing so the same input always maps to the
// same persona/token. Production should use an HMAC keyed in the customer's KMS.

export function hash53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

export function hashOf(salt: string, ...parts: string[]): number {
  return hash53(parts.join("\u0001"), hash53(salt) % 2 ** 31)
}

export function pick<T>(items: readonly T[], h: number): T {
  return items[h % items.length]
}

export function hashDigits(salt: string, value: string, length: number): string {
  let out = ""
  for (let i = 0; out.length < length; i++) out += String(hashOf(salt, "digits", value, String(i)))
  return out.slice(0, length)
}

export function randomId(prefix = ""): string {
  return prefix + Math.random().toString(36).slice(2, 10)
}
