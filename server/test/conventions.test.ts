// ADR-002 as executable policy: a tool that breaks these does not merge.
import { describe, expect, it } from "vitest";
import { TOOL_VERBS } from "../src/tools/define.js";
import { tools } from "../src/tools/index.js";

describe.each(tools.map((t) => [t.name, t] as const))("%s", (_name, tool) => {
  it("is verb_noun with a verb from the closed set", () => {
    expect(tool.name).toMatch(/^[a-z]+(_[a-z]+)+$/);
    expect(TOOL_VERBS).toContain(tool.name.split("_")[0]);
  });

  it("has a description written for a model", () => {
    expect(tool.description.length).toBeGreaterThan(30);
  });

  it("rejects unknown input fields", () => {
    expect(tool.inputSchema.safeParse({ __unexpected__: true }).success).toBe(false);
  });

  it("describes every input parameter", () => {
    for (const [key, field] of Object.entries(tool.inputSchema.shape)) {
      expect((field as { description?: string }).description, key).toBeTruthy();
    }
  });

  it("declares a summary in its output", () => {
    expect(tool.outputSchema.shape).toHaveProperty("summary");
  });
});

it("tool names are unique", () => {
  const names = tools.map((t) => t.name);
  expect(new Set(names).size).toBe(names.length);
});
