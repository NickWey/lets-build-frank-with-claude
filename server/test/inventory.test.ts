// ADR-009's rules for talking to Azure, one test per rule.
import { describe, expect, it } from "vitest";
import { ARM_HOST, createInventory, isOwnLink, resourcesPath } from "../src/azure/inventory.js";

const SUB = "00000000-0000-0000-0000-000000000000";
const RG = "rg-frank-class";
const PATH = resourcesPath(SUB, RG);
const BASE = `https://${ARM_HOST}${PATH}`;

interface Call {
  url: string;
  method: string;
}

function fakeArm(pages: Array<{ value?: unknown[]; nextLink?: string } | number>) {
  const calls: Call[] = [];
  let i = 0;
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    const page = pages[Math.min(i++, pages.length - 1)];
    if (typeof page === "number") return new Response("", { status: page });
    return new Response(JSON.stringify(page), { status: 200 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function inventory(fetch: typeof globalThis.fetch, now = () => 0) {
  return createInventory({ subscriptionId: SUB, resourceGroup: RG, getToken: async () => "tok", fetch, now });
}

const res = (name: string, type = "Microsoft.App/containerApps") => ({
  name,
  type,
  location: "eastus2",
  id: `/subscriptions/${SUB}/resourceGroups/${RG}/providers/${type}/${name}`,
  properties: { configuration: { secrets: ["do-not-leak"] } },
  tags: { owner: "someone" },
});

describe("inventory", () => {
  it("only ever GETs the group's resources URL and its own nextLinks", async () => {
    const { fetch, calls } = fakeArm([
      { value: [res("a")], nextLink: `${BASE}?api-version=2021-04-01&$skiptoken=x` },
      { value: [res("b")] },
    ]);
    const result = await inventory(fetch).get();

    expect(result).toMatchObject({ ok: true, pagesRemaining: false });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.method).toBe("GET");
      expect(new URL(call.url).host).toBe(ARM_HOST);
      expect(new URL(call.url).pathname).toBe(PATH);
    }
  });

  it("builds items from name, type and location only", async () => {
    const { fetch } = fakeArm([{ value: [res("a")] }]);
    const result = await inventory(fetch).get();
    if (!result.ok) throw new Error(result.message);
    expect(Object.keys(result.items[0]).sort()).toEqual(["location", "name", "type"]);
    expect(JSON.stringify(result)).not.toContain("do-not-leak");
  });

  it("refuses to follow a nextLink to another host or path", async () => {
    for (const evil of [
      `https://evil.example${PATH}?x=1`,
      `http://${ARM_HOST}${PATH}?x=1`,
      `https://${ARM_HOST}/subscriptions/${SUB}/resourceGroups/other-rg/resources?x=1`,
      `https://user:pw@${ARM_HOST}${PATH}`,
      "not a url",
    ]) {
      const { fetch, calls } = fakeArm([{ value: [res("a")], nextLink: evil }, { value: [res("b")] }]);
      const result = await inventory(fetch).get();
      expect(result.ok, evil).toBe(false);
      expect(calls, evil).toHaveLength(1);
    }
  });

  it("stops after 5 pages and reports pages remaining", async () => {
    const page = { value: [res("a")], nextLink: `${BASE}?api-version=2021-04-01&$skiptoken=more` };
    const { fetch, calls } = fakeArm([page]);
    const result = await inventory(fetch).get();
    expect(calls).toHaveLength(5);
    expect(result).toMatchObject({ ok: true, pagesRemaining: true });
  });

  it("caches for 30 seconds", async () => {
    let t = 0;
    const { fetch, calls } = fakeArm([{ value: [res("a")] }]);
    const inv = inventory(fetch, () => t);
    await inv.get();
    t = 29_999;
    await inv.get();
    expect(calls).toHaveLength(1);
    t = 30_000;
    await inv.get();
    expect(calls).toHaveLength(2);
  });

  it("runs one refresh at a time for concurrent callers", async () => {
    const { fetch, calls } = fakeArm([{ value: [res("a")] }]);
    const inv = inventory(fetch);
    await Promise.all([inv.get(), inv.get(), inv.get()]);
    expect(calls).toHaveLength(1);
  });

  it("caches failures too, so a throttled Frank stops asking", async () => {
    const { fetch, calls } = fakeArm([429]);
    const inv = inventory(fetch);
    const first = await inv.get();
    await inv.get();
    expect(first).toMatchObject({ ok: false });
    expect(!first.ok && first.message).toMatch(/throttling/);
    expect(calls).toHaveLength(1);
  });

  it("says which failure happened, in plain language", async () => {
    const refused = await inventory(fakeArm([403]).fetch).get();
    expect(!refused.ok && refused.message).toMatch(/refused/);

    const noToken = await createInventory({
      subscriptionId: SUB,
      resourceGroup: RG,
      getToken: async () => {
        throw new Error("AADSTS7000215: secret details");
      },
      fetch: fakeArm([{ value: [] }]).fetch,
    }).get();
    expect(!noToken.ok && noToken.message).toBe("Azure refused Frank's credential.");

    const unreachable = await inventory((async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch).get();
    expect(!unreachable.ok && unreachable.message).toBe("Frank could not reach Azure.");
  });
});

describe("timeout", () => {
  it("gives up when the whole refresh runs too long", async () => {
    // Each page is quick, but together they overrun the limit.
    const slowPage = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            resolve(
              new Response(JSON.stringify({ value: [], nextLink: `${BASE}?api-version=2021-04-01&$skiptoken=n` })),
            ),
          20,
        );
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(init.signal!.reason);
        });
      })) as typeof fetch;
    const result = await createInventory({
      subscriptionId: SUB,
      resourceGroup: RG,
      getToken: async () => "tok",
      fetch: slowPage,
      timeoutMs: 50,
    }).get();
    expect(!result.ok && result.message).toBe("Azure took longer than 10 seconds to answer.");
  });
});

describe("isOwnLink", () => {
  it("accepts the same path regardless of case and query", () => {
    expect(isOwnLink(`https://${ARM_HOST}${PATH.toUpperCase()}?$skiptoken=1`, PATH)).toBe(true);
  });
});
