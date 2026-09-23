import { z } from "zod";
import { defineTool } from "./define.js";

const MAX_ITEMS = 200;

// ADR-009: an inventory of the class resource group, nothing more. There is
// deliberately no group or subscription parameter — the scope is fixed at boot.
export const listResources = defineTool({
  name: "list_resources",
  description:
    "Lists what is in the Azure resource group Frank is deployed in: each resource's name, type and location, " +
    "with counts by type. Use it to answer what is running there. Returns an inventory only — no configuration, " +
    "logs or metrics — at most 200 items, and may be up to 30 seconds stale.",
  openWorld: true,
  inputSchema: z
    .object({
      type: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe(
          "Only return resources of this exact Azure type, case-insensitive, e.g. Microsoft.App/containerApps. Omit for everything.",
        ),
    })
    .strict(),
  outputSchema: z.object({
    summary: z.string(),
    resourceGroup: z.string(),
    count: z.number(),
    countsByType: z.record(z.string(), z.number()),
    truncated: z.boolean(),
    resources: z.array(z.object({ name: z.string(), type: z.string(), location: z.string() })),
  }),
  handler: async ({ type }, ctx) => {
    if (!ctx.azure.configured) {
      throw new Error(`Frank has no Azure settings here: ${ctx.azure.missing.join(", ")} not set.`);
    }
    const result = await ctx.azure.inventory.get();
    if (!result.ok) throw new Error(result.message);

    const wanted = type?.toLowerCase();
    const matching = wanted ? result.items.filter((r) => r.type.toLowerCase() === wanted) : result.items;
    const truncated = result.pagesRemaining || matching.length > MAX_ITEMS;
    const resources = matching.slice(0, MAX_ITEMS);

    const countsByType: Record<string, number> = {};
    for (const r of resources) countsByType[r.type] = (countsByType[r.type] ?? 0) + 1;
    const breakdown = Object.entries(countsByType)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${n} ${t}`)
      .join(", ");

    const scope = `resource group ${ctx.azure.resourceGroup}`;
    const summary =
      resources.length === 0
        ? `Nothing${type ? ` of type ${type}` : ""} in ${scope}.`
        : `${resources.length} resource${resources.length === 1 ? "" : "s"} in ${scope}: ${breakdown}.` +
          (truncated ? " The list was cut off; there are more." : "");

    return {
      summary,
      resourceGroup: ctx.azure.resourceGroup,
      count: resources.length,
      countsByType,
      truncated,
      resources,
    };
  },
});
