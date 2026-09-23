// All settings come from environment variables (ADR-001). No config files.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The package root is one level above this file in both layouts:
// src/config.ts under tsx, dist/config.js once built.
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

/** What deploy.yml injects (ADR-010). Scope is fixed here, at boot (ADR-009). */
export const AZURE_VARS = [
  "AZURE_SUBSCRIPTION_ID",
  "AZURE_RESOURCE_GROUP",
  "AZURE_CLIENT_ID",
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_SECRET",
] as const;

export type AzureConfig =
  | { configured: true; subscriptionId: string; resourceGroup: string }
  | { configured: false; missing: string[] };

export interface Config {
  port: number;
  version: string;
  /** Built Cloudscape console (ADR-006). Absent until ui/ is built. */
  publicDir: string;
  hasConsole: boolean;
  /** Optional: Frank boots without it, and Azure tools fail closed (ADR-009). */
  azure: AzureConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const publicDir = env.FRANK_PUBLIC_DIR ?? `${packageRoot}public`;
  const missing = AZURE_VARS.filter((name) => !env[name]);
  return {
    // Must match the Dockerfile's PORT and deploy.yml's --target-port.
    port: Number(env.PORT ?? 3000),
    version: pkg.version,
    publicDir,
    hasConsole: existsSync(`${publicDir}/index.html`),
    azure:
      missing.length === 0
        ? {
            configured: true,
            subscriptionId: env.AZURE_SUBSCRIPTION_ID!,
            resourceGroup: env.AZURE_RESOURCE_GROUP!,
          }
        : { configured: false, missing },
  };
}
