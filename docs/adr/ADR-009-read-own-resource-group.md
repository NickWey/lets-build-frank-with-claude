# ADR-009: Frank lists what is in the class resource group — an inventory, nothing more

**Status:** Proposed
**Date:** 2026-09

## Context

The day ends with *"Frank, what's running in your resource group?"*, a question
a model cannot answer from its weights. ADR-007 left `/mcp` open based on a
Reader grant to one seat's group. Under ADR-010 neither premise holds, and this
ADR accepts the wider exposure.

## Decision

- **One tool, `list_resources`.** It lists the group named by
  `AZURE_RESOURCE_GROUP` in `AZURE_SUBSCRIPTION_ID`, which are both read at boot.
  It takes one optional, described parameter: a resource type, such as
  `Microsoft.App/containerApps`. The type is matched exactly, ignoring case, in
  Frank. **There is no group or subscription parameter.**
- **Reads only.** Frank sends GETs to the group's Resource Manager resources URL.
  He follows `nextLink` for at most 5 pages, and only to links on the same ARM
  host and group path. A test asserts that the tool never uses another method
  or URL.
- **Cached for 30 seconds.** Only one refresh runs at a time, and failures are
  cached for the same 30 seconds. Frank filters the cached inventory, then caps
  it at 200 items. `truncated` is true if pages remained or the cap cut the list.
- **Allowlisted output.** Each item is *built* from `name`, `type` and
  `location`, and a test asserts those are the only keys. The `summary` gives
  counts by type.
- **Fails closed, in plain language.** Frank still boots. Any of the following
  returns `isError` with one sentence saying which:
  - an `AZURE_*` variable that ADR-010 injects is unset;
  - Azure refuses the request;
  - Azure throttles the request;
  - the refresh takes longer than 10 seconds.

## Consequences

- **Frank lists every student's container app**, and each name contains a
  GitHub username. The endpoint is open (ADR-007), so anyone on the internet can
  see that list for the life of the class.
- **Every Frank shares one principal with the deploy pipeline.** The cache
  limits each Frank to at most 10 ARM reads a minute, however many callers hit
  `/mcp`. That is about 300 a minute across a class of 30.
- The inventory can be up to 30 seconds stale.
- A future tool that returns more than an inventory reopens ADR-007 first.
- Rejected:
  - **`@azure/arm-resources`**: its client exposes writes beside list, so "reads
    only" couldn't be tested.
  - **Resource Graph**: a second API and query language for one list.
  - **Server-side `$filter`**: it would put caller input into OData, and it
    needs one cache entry per filter.
