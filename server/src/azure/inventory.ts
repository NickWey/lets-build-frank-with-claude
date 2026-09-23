// The only code in Frank that talks to Azure (ADR-009). It makes GETs to one
// Resource Manager URL and the nextLinks Azure returns for it — nothing else.
// The credential behind it is Contributor (ADR-010), so this file is where
// "read-only" is actually enforced.

export const ARM_HOST = "management.azure.com";
const API_VERSION = "2021-04-01";
const MAX_PAGES = 5;
const TTL_MS = 30_000;
const TIMEOUT_MS = 10_000;

export interface InventoryItem {
  name: string;
  type: string;
  location: string;
}

export type InventoryResult =
  | { ok: true; items: InventoryItem[]; pagesRemaining: boolean }
  | { ok: false; message: string };

export interface InventoryDeps {
  subscriptionId: string;
  resourceGroup: string;
  /** Returns an ARM bearer token. Not a call this module makes itself. */
  getToken: () => Promise<string>;
  fetch?: typeof fetch;
  now?: () => number;
  /** Tests shorten it; the ADR's value is 10 seconds. */
  timeoutMs?: number;
}

export interface Inventory {
  get(): Promise<InventoryResult>;
}

class Refused extends Error {}

export function resourcesPath(subscriptionId: string, resourceGroup: string): string {
  return `/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/resources`;
}

/** A nextLink is followed only if it points back at the same host and group path. */
export function isOwnLink(link: string, path: string): boolean {
  try {
    const url = new URL(link);
    return (
      url.protocol === "https:" &&
      url.host === ARM_HOST &&
      url.username === "" &&
      url.password === "" &&
      url.pathname.toLowerCase() === path.toLowerCase()
    );
  } catch {
    return false;
  }
}

// Built field by field: raw ARM objects carry configuration and env vars, and
// none of it may leave Frank (ADR-009, ADR-007).
function toItem(raw: unknown): InventoryItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    name: String(r.name ?? ""),
    type: String(r.type ?? ""),
    location: String(r.location ?? ""),
  };
}

function describeStatus(status: number): string {
  if (status === 429) return "Azure is throttling Frank's requests right now; try again in a minute.";
  if (status === 401 || status === 403) return "Azure refused Frank's credential.";
  return `Azure answered with HTTP ${status}.`;
}

export function createInventory(deps: InventoryDeps): Inventory {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const path = resourcesPath(deps.subscriptionId, deps.resourceGroup);

  let cached: { at: number; result: InventoryResult } | null = null;
  let inFlight: Promise<InventoryResult> | null = null;

  async function refresh(): Promise<InventoryResult> {
    const signal = AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS); // the whole refresh, not each page
    try {
      let token: string;
      try {
        token = await deps.getToken();
      } catch {
        throw new Refused("Azure refused Frank's credential.");
      }

      const items: InventoryItem[] = [];
      let url: string | undefined = `https://${ARM_HOST}${path}?api-version=${API_VERSION}`;
      let pages = 0;
      while (url && pages < MAX_PAGES) {
        const res = await doFetch(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal,
        });
        if (!res.ok) throw new Refused(describeStatus(res.status));
        const body = (await res.json()) as { value?: unknown[]; nextLink?: string };
        items.push(...(body.value ?? []).map(toItem));
        pages += 1;

        url = body.nextLink || undefined;
        if (url && !isOwnLink(url, path)) {
          throw new Refused("Azure returned a page link Frank will not follow.");
        }
      }
      return { ok: true, items, pagesRemaining: Boolean(url) };
    } catch (err) {
      if (err instanceof Refused) return { ok: false, message: err.message };
      if (signal.aborted) return { ok: false, message: "Azure took longer than 10 seconds to answer." };
      return { ok: false, message: "Frank could not reach Azure." };
    }
  }

  return {
    async get() {
      if (cached && now() - cached.at < TTL_MS) return cached.result;
      // One refresh at a time: concurrent callers share it.
      inFlight ??= refresh().then((result) => {
        // Failures are cached too, so a throttled Frank stops asking.
        cached = { at: now(), result };
        inFlight = null;
        return result;
      });
      return inFlight;
    },
  };
}
