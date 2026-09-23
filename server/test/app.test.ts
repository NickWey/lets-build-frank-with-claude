import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let server: Server;
let base: string;

beforeAll(async () => {
  const config = { ...loadConfig({}), publicDir: "/nonexistent", hasConsole: false };
  server = createApp(config).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("HTTP surface", () => {
  it("GET /healthz returns 200", async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  it("GET / says there is no console yet", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("No console");
  });

  it("GET /mcp is 405 (stateless server)", async () => {
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
  });
});

describe("MCP over Streamable HTTP", () => {
  it("lists and calls get_status", async () => {
    const client = new Client({ name: "test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("get_status");

    const result = await client.callTool({ name: "get_status", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ name: "Frank" });

    await client.close();
  });

  it("returns an error for unknown arguments rather than ignoring them", async () => {
    const client = new Client({ name: "test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const result = await client.callTool({ name: "get_status", arguments: { bogus: 1 } });
    expect(result.isError).toBe(true);
    await client.close();
  });
});
