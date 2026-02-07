const { readFileSync, existsSync } = require("fs");
const { resolve } = require("path");

// Load NEXT_PUBLIC_* vars from monorepo root .env since Next.js
// only auto-loads .env from its own project root (packages/dashboard/)
const rootEnvPath = resolve(__dirname, "../../.env");
const publicEnv = {};
if (existsSync(rootEnvPath)) {
  const lines = readFileSync(rootEnvPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (key.startsWith("NEXT_PUBLIC_")) {
      publicEnv[key] = val;
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@flaregate/shared"],
  env: publicEnv,
};

module.exports = nextConfig;
