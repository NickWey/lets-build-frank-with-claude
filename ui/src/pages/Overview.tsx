import { useCallback, useEffect, useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { callTool, getHealth } from "../frank";

interface Status {
  summary: string;
  version: string;
  uptimeSeconds: number;
  startedAt: string;
  greeting: string;
}

export function Overview({ onError }: { onError: (message: string) => void }) {
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const health = await getHealth();
    setHealthy(health.ok);
    try {
      const result = await callTool("get_status", {});
      if (result.isError) throw new Error("get_status returned an error");
      setStatus(result.structuredContent as unknown as Status);
    } catch (err) {
      setStatus(null);
      onError(`Could not reach Frank over MCP: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Frank's get_status output and connection health."
          actions={
            <Button iconName="refresh" loading={loading} onClick={() => void refresh()}>
              Refresh
            </Button>
          }
        >
          Overview
        </Header>
      }
    >
      <SpaceBetween size="l">
        <ColumnLayout columns={4} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">Connection</Box>
            {healthy === null ? (
              <StatusIndicator type="loading">Checking</StatusIndicator>
            ) : healthy ? (
              <StatusIndicator type="success">Healthy</StatusIndicator>
            ) : (
              <StatusIndicator type="error">Unreachable</StatusIndicator>
            )}
          </div>
          <div>
            <Box variant="awsui-key-label">Version</Box>
            <div>{status?.version ?? "—"}</div>
          </div>
          <div>
            <Box variant="awsui-key-label">Uptime</Box>
            <div>{status ? `${status.uptimeSeconds}s` : "—"}</div>
          </div>
          <div>
            <Box variant="awsui-key-label">Started</Box>
            <div>{status ? new Date(status.startedAt).toLocaleString() : "—"}</div>
          </div>
        </ColumnLayout>
        {status && <Box variant="p">{status.greeting}</Box>}
      </SpaceBetween>
    </Container>
  );
}
