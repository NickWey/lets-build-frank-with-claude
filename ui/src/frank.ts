// The console's only way to reach Frank: MCP over Streamable HTTP at /mcp,
// same origin (ADR-006). The console holds no secrets (ADR-003).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

export type { Tool };

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: "frank-console", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", window.location.origin)));
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

export function listTools(): Promise<Tool[]> {
  return withClient(async (c) => (await c.listTools()).tools);
}

export function callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  return withClient(async (c) => (await c.callTool({ name, arguments: args })) as CallToolResult);
}

export async function getHealth(): Promise<{ ok: boolean; version?: string }> {
  try {
    const res = await fetch("/healthz");
    const body = (await res.json()) as { version?: string };
    return { ok: res.ok, version: body.version };
  } catch {
    return { ok: false };
  }
}
