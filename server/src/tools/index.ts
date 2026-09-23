// Every tool Frank exposes. A tool that is not listed here does not exist.
import type { FrankTool } from "./define.js";
import { getStatus } from "./get-status.js";

export const tools: FrankTool[] = [getStatus];
