# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The classroom repo for the course "Let's Build Frank". **Frank** is a read-only MCP server with a Cloudscape web console. Both ship in **one container** to Azure Container Apps.

The design lives in `docs/adr/`. **Implement from ADRs by number** ("implement ADR-009"). An ADR decides what happens; the code follows it. Where ADRs conflict, read the Status lines: ADR-006 and ADR-010 partly supersede ADR-003/004/005, and ADR-007 is Rejected. Also read the "Supersession, precisely" section of ADR-006 before relying on ADR-003, 004 or 005.

## Commands

`server/` and `ui/` are separate npm packages, and there is no root package. Run each command from inside its package folder.

```bash
# server/ — Frank
npm run dev          # tsx watch, :3000 (PORT overrides)
npm test             # vitest run
npm run build        # tsc -> dist/
npx vitest run test/get-status.test.ts        # one file
npx vitest run -t "rejects unknown input"     # one test by name

# ui/ — console
npm run dev          # Vite; proxies /mcp and /healthz to localhost:3000, so run server dev too
npm test
npm run build        # tsc --noEmit && vite build -> dist/

# whole image, exactly as the pipeline builds it
docker build -t frank:local . && docker run -p 3000:3000 frank:local
```

The root `Dockerfile` is the **test gate on `main`**. Both of its build stages run `npm test`, and the PR-only jobs in `deploy.yml` are skipped on `main`, so a failing suite fails the image build and nothing deploys. The UI stage tolerates an empty `ui/` because the console is optional (ADR-003).

## Architecture

- **One origin.** Frank's Express app (`server/src/app.ts`) serves:
  - `POST /mcp`: Streamable HTTP, **stateless**. A fresh `McpServer` and transport are created per request, and `GET`/`DELETE /mcp` return 405.
  - `GET /healthz`
  - the built console at `/`. It is served only if `public/index.html` exists; otherwise `/` returns a plain-text notice.

  Because everything shares one origin, the console calls `/mcp` relatively. There is no CORS and no `VITE_FRANK_URL` (ADR-006).
- **The Docker build puts the console next to Frank.** It copies `ui/dist` → `/app/public`. `server/src/config.ts` resolves `public/` as the package root plus `/public`, which is one level above `src/` or `dist/`. `FRANK_PUBLIC_DIR` overrides it.
- **Config comes only from environment variables** (ADR-001). The container port is `3000`, and it must match in three places: the `Dockerfile`, `config.ts`, and `--target-port` in `deploy.yml`.
- **Tools** live in `server/src/tools/`, one module per tool, and are registered in `tools/index.ts`. Every tool is a `defineTool({...})`. `registerTool` in `define.ts` is the only place that talks to the SDK. It adds read-only annotations, returns `structuredContent` plus a JSON text copy, and turns thrown errors into `isError: true` with a plain message.
- **The console builds its call forms from each tool's JSON input schema** (`ui/src/schemaForm.ts`). A new tool shows up in the Tools page with no UI changes.

## Tool rules (ADR-002). These are policy.

- **Names:** `verb_noun`, where the verb is one of **`get`, `list`, `search` or `summarize`**. `create_`, `update_`, `delete_` and `run_` are out of policy and need a new ADR, not a tool.
- **Frank is read-only.** He never changes Azure, GitHub, or the filesystem beyond temp space.
- **Input:** a `z.object({...}).strict()`, so unknown fields are rejected. Every field gets `.describe(...)`.
- **Output:** a top-level `summary` string plus typed fields, declared in `outputSchema`.
- **Descriptions** are written for a model deciding whether to call the tool.
- `server/test/conventions.test.ts` enforces these rules for every registered tool. Add a test under `server/test/` for each new tool. The `frank-tools` skill and the `tool-conventions` agent cover the same rules.
- **Azure tools (ADR-009)** read their scope from `AZURE_RESOURCE_GROUP` at boot. **Never add a resource-group parameter**, because the lack of one is what stops a caller pointing Frank at another group (see ADR-007). Frank authenticates with `DefaultAzureCredential`, using the `AZURE_*` env vars that `deploy.yml` injects (ADR-010).

## ADR workflow (ADR-000)

- Use `/adr <title>` to draft a new ADR. It takes the next number, sets it to Proposed, and runs the draft past the `adr-reviewer` agent. Leave it uncommitted, because accepting it is a human's call.
- An Accepted ADR is **immutable**. To change one, write a new ADR that supersedes it; only the Status line of the old ADR may change. Rejected ADRs are kept, not deleted.
- Keep each ADR to one page, roughly 290–375 words. SDK names and function signatures belong in code, not in the ADR.
- When you add an ADR, update the tables in **both** `docs/adr/README.md` and the root `README.md`.

## Deployment (ADR-010) and the traps in it

- **Pushing to `main` deploys** the app `frank-<github-owner>` into the shared `rg-frank-class` resource group. PRs only build and test, with no Azure involved. Confirm with the user before merging or pushing to `main`.
- `deploy.yml` fetches the classroom credential from `CREDENTIAL_URL` by itself. **Do not set `AZURE_CREDENTIALS` on the fork**; that secret is only the instructor's manual override. Never write the credential to a file, a prompt, `CLAUDE.md` or an ADR.
- In a fork clone, `gh` can resolve to the upstream repo (`Buckshot-Technologies/…`). Pass `--repo <owner>/lets-build-frank-with-claude` explicitly.
- Deploy with `az acr build` followed by `az containerapp create`/`update`. **Do not use `az containerapp up --source`**, which crashes on some azure-cli builds.
- GitHub disables Actions on forks by default. If a push "does nothing", check that Actions is enabled on the fork.
