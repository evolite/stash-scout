import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

// Lives next to secretStore's key file, same posture: single-user tool, no
// external KMS. This closes "anyone who can reach the port" (the actual gap —
// see the adversarial review), not "attacker has disk access."
const DATA_DIR = path.join(process.cwd(), "data");
const SECRET_FILE = path.join(DATA_DIR, "app-secret");

export async function loadAppSecret(): Promise<{ secret: string; generated: boolean }> {
  const fromEnv = process.env.APP_SECRET?.trim();
  if (fromEnv) return { secret: fromEnv, generated: false };

  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const existing = (await fs.readFile(SECRET_FILE, "utf8")).trim();
    if (existing) return { secret: existing, generated: false };
  } catch {
    // fall through to generate
  }
  const secret = randomBytes(24).toString("base64url");
  await fs.writeFile(SECRET_FILE, secret, { mode: 0o600 });
  return { secret, generated: true };
}
