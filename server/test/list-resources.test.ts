import { describe, expect, it } from "vitest";
import type { Inventory, InventoryResult } from "../src/azure/inventory.js";
import type { ToolContext } from "../src/tools/define.js";
import { listResources } from "../src/tools/list-resources.js";

function ctx(result: InventoryResult): ToolContext {
  const inventory: Inventory = { get: async () => result };
  return {
    version: "0.0.0",
    startedAt: new Date(),
    azure: { configured: true, resourceGroup: "rg-frank-class", inventory },
  };
}

const item = (name: string, type: string) => ({ name, type, location: "eastus2" });

describe("list_resources", () => {
  const items = [
    item("frank-a", "Microsoft.App/containerApps"),
    item("frank-b", "Microsoft.App/containerApps"),
    item("acrclass", "Microsoft.ContainerRegistry/registries"),
  ];

  it("returns the inventory with counts by type and a summary", async () => {
    const out = await listResources.handler({}, ctx({ ok: true, items, pagesRemaining: false }));
    expect(listResources.outputSchema.parse(out)).toBeTruthy();
    expect(out.countsByType).toEqual({
      "Microsoft.App/containerApps": 2,
      "Microsoft.ContainerRegistry/registries": 1,
    });
    expect(out.truncated).toBe(false);
    expect(out.summary).toContain("3 resources in resource group rg-frank-class");
  });

  it("filters by exact type, ignoring case", async () => {
    const out = await listResources.handler(
      { type: "microsoft.app/CONTAINERAPPS" },
      ctx({ ok: true, items, pagesRemaining: false }),
    );
    expect(out.resources.map((r) => r.name)).toEqual(["frank-a", "frank-b"]);

    const partial = await listResources.handler({ type: "Microsoft.App" }, ctx({ ok: true, items, pagesRemaining: false }));
    expect(partial.count).toBe(0);
  });

  it("filters first, then caps at 200 and sets truncated", async () => {
    const many = [
      ...Array.from({ length: 250 }, (_, i) => item(`x${i}`, "Other/thing")),
      ...Array.from({ length: 201 }, (_, i) => item(`app${i}`, "Microsoft.App/containerApps")),
    ];
    const out = await listResources.handler(
      { type: "Microsoft.App/containerApps" },
      ctx({ ok: true, items: many, pagesRemaining: false }),
    );
    expect(out.count).toBe(200);
    expect(out.resources.every((r) => r.type === "Microsoft.App/containerApps")).toBe(true);
    expect(out.truncated).toBe(true);
  });

  it("is truncated when Azure had pages left, even under the cap", async () => {
    const out = await listResources.handler({}, ctx({ ok: true, items, pagesRemaining: true }));
    expect(out.truncated).toBe(true);
  });

  it("fails closed when Azure settings are missing", async () => {
    const noAzure: ToolContext = {
      version: "0",
      startedAt: new Date(),
      azure: { configured: false, missing: ["AZURE_CLIENT_SECRET"] },
    };
    await expect(listResources.handler({}, noAzure)).rejects.toThrow(/AZURE_CLIENT_SECRET not set/);
  });

  it("passes Azure's plain-language failure through", async () => {
    await expect(listResources.handler({}, ctx({ ok: false, message: "Azure refused Frank's credential." }))).rejects.toThrow(
      "Azure refused Frank's credential.",
    );
  });

  it("has no parameter that could move the scope", () => {
    expect(Object.keys(listResources.inputSchema.shape)).toEqual(["type"]);
    expect(listResources.inputSchema.safeParse({ resourceGroup: "other" }).success).toBe(false);
    expect(listResources.inputSchema.safeParse({ subscriptionId: "other" }).success).toBe(false);
  });
});
