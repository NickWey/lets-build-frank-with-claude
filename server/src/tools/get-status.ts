import { z } from "zod";
import { defineTool } from "./define.js";

// ADR-002's first tool: proves the pipeline, client wiring, and console
// before any Azure integration exists.
export const getStatus = defineTool({
  name: "get_status",
  description:
    "Returns Frank's version, how long he has been running, and a greeting. " +
    "Use it to check that Frank is reachable; it reports nothing about Azure.",
  inputSchema: z.object({}).strict(),
  outputSchema: z.object({
    summary: z.string(),
    name: z.string(),
    version: z.string(),
    startedAt: z.string(),
    uptimeSeconds: z.number(),
    greeting: z.string(),
  }),
  handler: async (_input, ctx) => {
    const uptimeSeconds = Math.floor((Date.now() - ctx.startedAt.getTime()) / 1000);
    const greeting = "Hi, I'm Frank. I can look, but I don't touch.";
    return {
      summary: `Frank ${ctx.version} is up, running for ${uptimeSeconds}s.`,
      name: "Frank",
      version: ctx.version,
      startedAt: ctx.startedAt.toISOString(),
      uptimeSeconds,
      greeting,
    };
  },
});
