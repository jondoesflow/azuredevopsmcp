import type { ProcessDefinition } from "./types.js";
import agileWithEnrichment from "./agile-with-enrichment.js";
import financeAndOperations from "./finance-and-operations.js";

export type { ProcessDefinition, ProcessFieldDefinition, ProcessLayoutPage, ProcessLayoutGroup } from "./types.js";

// ---------------------------------------------------------------------------
// Registry — add new process definitions here
// ---------------------------------------------------------------------------

const PROCESS_REGISTRY: Record<string, ProcessDefinition> = {
  "Agile with Enrichment": agileWithEnrichment,
  "Finance and Operations": financeAndOperations,
};

/**
 * Get a process definition by its exact name.
 * Throws if the name is not registered.
 */
export function getProcessDefinition(processName: string): ProcessDefinition {
  const def = PROCESS_REGISTRY[processName];
  if (!def) {
    const available = Object.keys(PROCESS_REGISTRY).join(", ");
    throw new Error(
      `Unknown process definition "${processName}". Available: ${available}`,
    );
  }
  return def;
}

/**
 * List all registered process definition names.
 */
export function listProcessDefinitions(): string[] {
  return Object.keys(PROCESS_REGISTRY);
}
