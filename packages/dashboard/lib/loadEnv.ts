import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

/**
 * Load ALL env vars from the monorepo root .env into process.env.
 * Route Handlers need server-side secrets (AGENT_PRIVATE_KEY, RPC_URL, etc.)
 * that next.config.js doesn't inject (it only handles NEXT_PUBLIC_* vars).
 */
let loaded = false;

export function loadRootEnv() {
  if (loaded) return;
  loaded = true;

  const rootEnvPath = resolve(process.cwd(), "../../.env");
  if (!existsSync(rootEnvPath)) return;

  const lines = readFileSync(rootEnvPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}
