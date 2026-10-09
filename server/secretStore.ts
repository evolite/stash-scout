import { randomBytes, createCipheriv, createDecipheriv, createHmac } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

// process.cwd() rather than a path relative to this file's own location — see
// the same reasoning in index.ts's frontendDist (dev's tsx-run-from-source vs
// the compiled dist-server/server/ nesting resolve to different depths, but
// both are always launched with cwd = project root).
const DATA_DIR = path.join(process.cwd(), "data");
const KEY_FILE = path.join(DATA_DIR, ".secret-key");

// AES-256-GCM at rest. The key lives in its own 0600 file next to (not inside)
// settings.json, so a leaked/committed settings.json alone doesn't expose secrets.
// This protects against casual disk exposure, not a full local-root compromise —
// there's no external KMS here, which is the accepted tradeoff for a
// single-user, self-hosted tool.
let cachedKey: Buffer | undefined;

async function getKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(KEY_FILE, "utf8");
    cachedKey = Buffer.from(raw.trim(), "base64");
  } catch {
    cachedKey = randomBytes(32);
    await fs.writeFile(KEY_FILE, cachedKey.toString("base64"), { mode: 0o600 });
  }
  return cachedKey;
}

// Separate HMAC key derived from the at-rest key, so session cookies and
// stored secrets never share raw key material.
export async function sessionKey(): Promise<Buffer> {
  return createHmac("sha256", await getKey()).update("session").digest();
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export async function decrypt(payload: string): Promise<string> {
  const key = await getKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
