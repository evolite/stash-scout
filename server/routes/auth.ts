import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import * as oidc from "openid-client";
import type { AppConfig } from "../config.js";
import { sessionKey } from "../secretStore.js";
import { COOKIE, isLoggedIn, readCookie, setCookie, sign, startSession, verify, verifyPassword } from "../auth.js";

const OIDC_COOKIE = "ss_oidc";

const redirectUri = (req: Request) => `${req.protocol}://${req.get("host")}/api/auth/oidc/callback`;

export function discoverOidc(cfg: AppConfig): Promise<oidc.Configuration> {
  return oidc.discovery(new URL(cfg.oidcIssuer!), cfg.oidcClientId!, cfg.oidcClientSecret);
}

export function authRouter(cfg: AppConfig) {
  const router = Router();
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20 });

  router.get("/auth/status", async (req, res) => {
    res.json({ mode: cfg.authMode, loggedIn: cfg.authMode === "off" || (await isLoggedIn(req)) });
  });

  router.post("/auth/login", loginLimiter, async (req, res) => {
    const { username, password } = req.body ?? {};
    if (cfg.authMode !== "local" || typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "bad request" });
    }
    // Always run scrypt, even for a wrong username, so timing doesn't reveal which was wrong.
    const passOk = verifyPassword(password, cfg.authPasswordHash);
    if (username !== cfg.authUsername || !passOk) return res.status(401).json({ error: "invalid credentials" });
    await startSession(req, res, username);
    res.status(204).end();
  });

  router.post("/auth/logout", (req, res) => {
    setCookie(req, res, COOKIE, "", 0);
    res.status(204).end();
  });

  router.get("/auth/oidc/login", loginLimiter, async (req, res) => {
    if (cfg.authMode !== "oidc") return res.status(400).json({ error: "oidc not enabled" });
    try {
      const config = await discoverOidc(cfg);
      const verifier = oidc.randomPKCECodeVerifier();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const url = oidc.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri(req),
        scope: "openid email",
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256",
        state,
        nonce,
      });
      setCookie(req, res, OIDC_COOKIE, sign({ verifier, state, nonce }, 10 * 60_000, await sessionKey()), 10 * 60_000);
      res.redirect(url.href);
    } catch (err) {
      console.error("oidc login:", err);
      res.status(502).send("OIDC provider unreachable or misconfigured");
    }
  });

  router.get("/auth/oidc/callback", loginLimiter, async (req, res) => {
    const flow = verify<{ verifier: string; state: string; nonce: string }>(readCookie(req, OIDC_COOKIE), await sessionKey());
    if (cfg.authMode !== "oidc" || !flow) return res.status(400).send("Login expired, try again");
    try {
      const config = await discoverOidc(cfg);
      const tokens = await oidc.authorizationCodeGrant(config, new URL(`${redirectUri(req)}?${new URLSearchParams(req.query as Record<string, string>)}`), {
        pkceCodeVerifier: flow.verifier,
        expectedState: flow.state,
        expectedNonce: flow.nonce,
      });
      const claims = tokens.claims()!;
      const email = typeof claims.email === "string" ? claims.email : undefined;
      const allowed = cfg.oidcAllowed?.trim().toLowerCase();
      if (allowed && allowed !== claims.sub.toLowerCase() && allowed !== email?.toLowerCase()) {
        return res.status(403).send("This account is not allowed");
      }
      setCookie(req, res, OIDC_COOKIE, "", 0);
      await startSession(req, res, email ?? claims.sub);
      res.redirect("/");
    } catch (err) {
      console.error("oidc callback:", err);
      res.status(401).send("Login failed");
    }
  });

  return router;
}
