import { describe, expect, it } from "vitest";
import { argsFromForm, fieldsFromSchema } from "../src/schemaForm";

const schema = {
  type: "object",
  properties: {
    name: { type: "string", description: "A name" },
    limit: { type: "integer" },
    verbose: { type: "boolean" },
    kind: { type: "string", enum: ["a", "b"] },
    filter: { type: "object" },
  },
  required: ["name"],
};

describe("fieldsFromSchema", () => {
  it("maps JSON schema types to field kinds", () => {
    const kinds = Object.fromEntries(fieldsFromSchema(schema).map((f) => [f.name, f.kind]));
    expect(kinds).toEqual({ name: "string", limit: "number", verbose: "boolean", kind: "enum", filter: "json" });
  });

  it("marks required fields and keeps descriptions", () => {
    const name = fieldsFromSchema(schema).find((f) => f.name === "name")!;
    expect(name).toMatchObject({ required: true, description: "A name" });
  });

  it("yields no fields for a parameterless tool like get_status", () => {
    expect(fieldsFromSchema({ type: "object", properties: {} })).toEqual([]);
    expect(fieldsFromSchema(undefined)).toEqual([]);
  });
});

describe("argsFromForm", () => {
  it("converts strings back to typed arguments and omits empty optionals", () => {
    const fields = fieldsFromSchema(schema);
    expect(
      argsFromForm(fields, { name: "frank", limit: "5", verbose: "true", kind: "a", filter: '{"x":1}' }),
    ).toEqual({ name: "frank", limit: 5, verbose: true, kind: "a", filter: { x: 1 } });
    expect(argsFromForm(fields, { name: "frank" })).toEqual({ name: "frank" });
  });
});
