import express, { type Express } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { DefaultAzureCredential } from "@azure/identity";
import { createInventory, type Inventory } from "./azure/inventory.js";
import type { Config } from "./config.js";
import { registerTool, type ToolContext } from "./tools/define.js";
import { tools } from "./tools/index.js";

function buildMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "frank", version: ctx.version });
  for (const tool of tools) registerTool(server, tool, ctx);
  return server;
}

function armInventory(subscriptionId: string, resourceGroup: string): Inventory {
  // DefaultAzureCredential picks up the AZURE_* values deploy.yml injects (ADR-010).
  const credential = new DefaultAzureCredential();
  return createInventory({
    subscriptionId,
    resourceGroup,
    getToken: async () => {
      const token = await credential.getToken("https://management.azure.com/.default");
      if (!token) throw new Error("no token");
      return token.token;
    },
  });
}

export interface AppDeps {
  startedAt?: Date;
  /** Tests inject a fake; otherwise built from config.azure. */
  inventory?: Inventory;
}

export function createApp(config: Config, deps: AppDeps = {}): Express {
  // Built once per process, so the inventory cache is shared by every request.
  const azure: ToolContext["azure"] = config.azure.configured
    ? {
        configured: true,
        resourceGroup: config.azure.resourceGroup,
        inventory:
          deps.inventory ?? armInventory(config.azure.subscriptionId, config.azure.resourceGroup),
      }
    : { configured: false, missing: config.azure.missing };
  const ctx: ToolContext = { version: config.version, startedAt: deps.startedAt ?? new Date(), azure };
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Container health probe (ADR-001).
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", version: config.version });
  });

  // Streamable HTTP, stateless: a fresh server + transport per request, so
  // scale-to-zero and restarts lose nothing (ADR-001, ADR-004).
  app.post("/mcp", async (req, res) => {
    const server = buildMcpServer(ctx);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Frank hit an internal error." },
          id: null,
        });
      }
    }
  });

  // Stateless: no SSE stream to resume and no session to delete.
  const methodNotAllowed: express.RequestHandler = (_req, res) => {
    res.status(405).set("Allow", "POST").json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. Frank speaks POST /mcp." },
      id: null,
    });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  // The console, served from the same container (ADR-006). Optional (ADR-003).
  if (config.hasConsole) {
    app.use(express.static(config.publicDir));
  } else {
    app.get("/", (_req, res) => {
      res
        .type("text/plain")
        .send("Frank is running. No console has been built yet (ADR-003) — MCP is at POST /mcp.\n");
    });
  }

  return app;
}
