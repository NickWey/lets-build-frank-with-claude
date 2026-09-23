// Every tool Frank exposes. A tool that is not listed here does not exist.
import type { FrankTool } from "./define.js";
import { getStatus } from "./get-status.js";
import { listResources } from "./list-resources.js";

export const tools: FrankTool[] = [getStatus, listResources];
