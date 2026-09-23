// The shape every Frank tool takes (ADR-002). Tools are pure functions from
// validated input to a result with a `summary`; registration and error
// handling live here once, so no tool can forget them.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export const TOOL_VERBS = ["get", "list", "search", "summarize"] as const;

export interface ToolContext {
  version: string;
  startedAt: Date;
}

export interface ToolResult {
  summary: string;
  [detail: string]: unknown;
}

export interface FrankTool<In extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  /** Strict: unknown fields are rejected. */
  inputSchema: In;
  outputSchema: z.ZodObject;
  handler: (input: z.infer<In>, ctx: ToolContext) => Promise<ToolResult>;
}

export function defineTool<In extends z.ZodObject>(tool: FrankTool<In>): FrankTool<In> {
  return tool;
}

export function registerTool(server: McpServer, tool: FrankTool, ctx: ToolContext): void {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      // ADR-002: Frank observes; he does not act.
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (input: unknown): Promise<CallToolResult> => {
      try {
        const result = await tool.handler(input as never, ctx);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (err) {
        // Plain language, never a stack trace (ADR-002).
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `${tool.name} failed: ${message}` }],
        };
      }
    },
  );
}
