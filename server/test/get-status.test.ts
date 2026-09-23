import { describe, expect, it } from "vitest";
import { getStatus } from "../src/tools/get-status.js";

describe("get_status", () => {
  it("reports version, uptime and a greeting, with a summary", async () => {
    const startedAt = new Date(Date.now() - 42_000);
    const result = await getStatus.handler({}, { version: "9.9.9", startedAt });

    expect(getStatus.outputSchema.parse(result)).toBeTruthy();
    expect(result.version).toBe("9.9.9");
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(42);
    expect(result.summary).toContain("9.9.9");
  });

  it("rejects unknown input fields", () => {
    expect(getStatus.inputSchema.safeParse({ resource_group: "someone-else" }).success).toBe(false);
  });
});
