import { useCallback, useEffect, useState } from "react";
import AppLayout from "@cloudscape-design/components/app-layout";
import Flashbar, { type FlashbarProps } from "@cloudscape-design/components/flashbar";
import SideNavigation from "@cloudscape-design/components/side-navigation";
import { Overview } from "./pages/Overview";
import { Tools } from "./pages/Tools";

type Page = "overview" | "tools";

function pageFromHash(): Page {
  return window.location.hash === "#/tools" ? "tools" : "overview";
}

export function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [flashes, setFlashes] = useState<FlashbarProps.MessageDefinition[]>([]);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const onError = useCallback((message: string) => {
    const id = String(Date.now());
    setFlashes((f) => [
      ...f,
      { id, type: "error", content: message, dismissible: true, onDismiss: () => setFlashes((x) => x.filter((m) => m.id !== id)) },
    ]);
  }, []);

  return (
    <AppLayout
      toolsHide
      notifications={<Flashbar items={flashes} />}
      navigation={
        <SideNavigation
          header={{ text: "Frank", href: "#/" }}
          activeHref={page === "tools" ? "#/tools" : "#/"}
          items={[
            { type: "link", text: "Overview", href: "#/" },
            { type: "link", text: "Tools", href: "#/tools" },
          ]}
        />
      }
      content={page === "tools" ? <Tools onError={onError} /> : <Overview onError={onError} />}
    />
  );
}
