// All settings come from environment variables (ADR-001). No config files.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The package root is one level above this file in both layouts:
// src/config.ts under tsx, dist/config.js once built.
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export interface Config {
  port: number;
  version: string;
  /** Built Cloudscape console (ADR-006). Absent until ui/ is built. */
  publicDir: string;
  hasConsole: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const publicDir = env.FRANK_PUBLIC_DIR ?? `${packageRoot}public`;
  return {
    // Must match the Dockerfile's PORT and deploy.yml's --target-port.
    port: Number(env.PORT ?? 3000),
    version: pkg.version,
    publicDir,
    hasConsole: existsSync(`${publicDir}/index.html`),
  };
}
