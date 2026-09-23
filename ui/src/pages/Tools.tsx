import { useEffect, useMemo, useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import Textarea from "@cloudscape-design/components/textarea";
import { callTool, listTools, type Tool } from "../frank";
import { argsFromForm, fieldsFromSchema, type Field } from "../schemaForm";

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
}) {
  switch (field.kind) {
    case "enum":
    case "boolean": {
      const options = (field.kind === "boolean" ? ["true", "false"] : field.options ?? []).map((o) => ({
        label: o,
        value: o,
      }));
      return (
        <Select
          selectedOption={options.find((o) => o.value === value) ?? null}
          options={options}
          onChange={({ detail }) => onChange(detail.selectedOption.value ?? "")}
        />
      );
    }
    case "json":
      return <Textarea value={value} onChange={({ detail }) => onChange(detail.value)} placeholder="JSON" />;
    default:
      return (
        <Input
          type={field.kind === "number" ? "number" : "text"}
          value={value}
          onChange={({ detail }) => onChange(detail.value)}
        />
      );
  }
}

export function Tools({ onError }: { onError: (message: string) => void }) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Tool | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    listTools()
      .then(setTools)
      .catch((err) => onError(`Could not list Frank's tools: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setLoading(false));
  }, [onError]);

  const fields = useMemo(() => fieldsFromSchema(selected?.inputSchema), [selected]);

  async function invoke() {
    if (!selected) return;
    setCalling(true);
    setResult(null);
    try {
      const res = await callTool(selected.name, argsFromForm(fields, values));
      setResult(JSON.stringify(res.structuredContent ?? res.content, null, 2));
      if (res.isError) onError(`${selected.name} returned an error.`);
    } catch (err) {
      onError(`Call failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCalling(false);
    }
  }

  return (
    <SpaceBetween size="l">
      <Table
        header={<Header counter={`(${tools.length})`} description="Discovered over MCP.">Tools</Header>}
        loading={loading}
        loadingText="Asking Frank"
        items={tools}
        selectionType="single"
        selectedItems={selected ? [selected] : []}
        onSelectionChange={({ detail }) => {
          setSelected(detail.selectedItems[0] ?? null);
          setValues({});
          setResult(null);
        }}
        trackBy="name"
        columnDefinitions={[
          { id: "name", header: "Name", cell: (t) => <Box variant="code">{t.name}</Box> },
          { id: "description", header: "Description", cell: (t) => t.description },
        ]}
        empty={<Box textAlign="center">Frank has no tools.</Box>}
      />
      {selected && (
        <Container header={<Header variant="h2">Call {selected.name}</Header>}>
          <form onSubmit={(e) => (e.preventDefault(), void invoke())}>
            <Form actions={<Button variant="primary" loading={calling}>Call tool</Button>}>
              <SpaceBetween size="m">
                {fields.length === 0 && <Box color="text-body-secondary">This tool takes no parameters.</Box>}
                {fields.map((f) => (
                  <FormField key={f.name} label={f.label} description={f.description} constraintText={f.required ? "Required" : "Optional"}>
                    <FieldInput field={f} value={values[f.name] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
                  </FormField>
                ))}
              </SpaceBetween>
            </Form>
          </form>
          {result && (
            <Box margin={{ top: "l" }}>
              <Box variant="awsui-key-label">Result</Box>
              <Box variant="code">
                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{result}</pre>
              </Box>
            </Box>
          )}
        </Container>
      )}
    </SpaceBetween>
  );
}
