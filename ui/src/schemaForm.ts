// Turns a tool's JSON input schema into form fields, so a new tool appears in
// the console with no UI work (ADR-003's payoff from ADR-002's schemas).

export type FieldKind = "string" | "number" | "boolean" | "enum" | "json";

export interface Field {
  name: string;
  kind: FieldKind;
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
}

interface JsonSchemaProp {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
}

interface ObjectSchema {
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
}

function kindOf(prop: JsonSchemaProp): FieldKind {
  if (Array.isArray(prop.enum) && prop.enum.every((v) => typeof v === "string")) return "enum";
  const type = Array.isArray(prop.type) ? prop.type.find((t) => t !== "null") : prop.type;
  if (type === "string") return "string";
  if (type === "number" || type === "integer") return "number";
  if (type === "boolean") return "boolean";
  return "json";
}

export function fieldsFromSchema(schema: unknown): Field[] {
  const { properties = {}, required = [] } = (schema ?? {}) as ObjectSchema;
  return Object.entries(properties).map(([name, prop]) => {
    const kind = kindOf(prop);
    return {
      name,
      kind,
      label: name,
      description: prop.description,
      required: required.includes(name),
      options: kind === "enum" ? (prop.enum as string[]) : undefined,
    };
  });
}

/** Form state is all strings; convert back to typed arguments. Empty optional fields are omitted. */
export function argsFromForm(fields: Field[], values: Record<string, string>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.name] ?? "";
    if (raw === "" && !field.required) continue;
    switch (field.kind) {
      case "number":
        args[field.name] = Number(raw);
        break;
      case "boolean":
        args[field.name] = raw === "true";
        break;
      case "json":
        args[field.name] = JSON.parse(raw);
        break;
      default:
        args[field.name] = raw;
    }
  }
  return args;
}
