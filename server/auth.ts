import assert from "node:assert/strict";
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { AppConfig } from "./config.js";
import { sessionKey } from "./secretStore.js";

export const COOKIE = "ss_session";
const SESSION_MS = 7 * 24 * 3_600_000;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string | undefined): boolean {
  const [salt, hash] = (stored ?? "").split(":");
  if (!salt || !hash) return false;
  const want = Buffer.from(hash, "hex");
  const got = scryptSync(pw, Buffer.from(salt, "hex"), want.length);
  return timingSafeEqual(want, got);
}

// "<base64url json>.<hmac>" — stateless, so logout only clears the cookie.
export function sign(payload: object, ttlMs: number, key: Buffer): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString("base64url");
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}

export function verify<T = { sub: string }>(token: string | undefined, key: Buffer): T | null {
  const [body, mac] = (token ?? "").split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", key).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString());
  return data.exp > Date.now() ? data : null;
}

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
}

export function setCookie(req: Request, res: Response, name: string, value: string, maxAgeMs: number): void {
  res.append(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${req.secure ? "; Secure" : ""}`,
  );
}

export async function startSession(req: Request, res: Response, sub: string): Promise<void> {
  setCookie(req, res, COOKIE, sign({ sub }, SESSION_MS, await sessionKey()), SESSION_MS);
}

export async function isLoggedIn(req: Request): Promise<boolean> {
  return !!verify(readCookie(req, COOKIE), await sessionKey());
}

// Reads cfg.authMode live, so flipping the toggle in Settings applies without a restart.
export function requireAuth(cfg: AppConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (cfg.authMode === "off" || req.path.startsWith("/auth/") || (await isLoggedIn(req))) return next();
    res.status(401).json({ error: "unauthorized" });
  };
}

async function demo(): Promise<void> {
  const h = hashPassword("hunter2");
  assert(verifyPassword("hunter2", h));
  assert(!verifyPassword("hunter3", h));
  assert(!verifyPassword("x", undefined));
  const key = randomBytes(32);
  const t = sign({ sub: "me" }, 60_000, key);
  assert.equal(verify(t, key)?.sub, "me");
  assert.equal(verify(t + "x", key), null);
  assert.equal(verify(t, randomBytes(32)), null);
  assert.equal(verify(sign({ sub: "me" }, -1, key), key), null);
  console.log("auth ok");
}
if (import.meta.url === `file://${process.argv[1]}`) await demo();
