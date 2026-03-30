// ---------------------------------------------------------------------------
// Process Definition Types — configurable per process template
// ---------------------------------------------------------------------------

export interface ProcessFieldDefinition {
  referenceName: string; // e.g. "Custom.EnrichmentConfidenceOverall"
  name: string; // e.g. "Confidence Overall"
  type: string; // "string" | "integer" | "double" | "html" | "plainText"
  description?: string;
  required?: boolean;
  defaultValue?: string;
  allowedValues?: string[];
}

export interface ProcessLayoutGroup {
  label: string;
  fields: string[]; // reference names of fields to include in this group
}

export interface ProcessLayoutPage {
  label: string;
  groups: ProcessLayoutGroup[];
}

export interface ProcessDefinition {
  /** Display name — must match exactly what ADO shows (e.g. "Agile with Enrichment") */
  name: string;
  /** The base/parent process to inherit from (e.g. "Agile", "Scrum") */
  parentProcess: string;
  /** Human-readable description */
  description: string;
  /** Custom fields to add to the process */
  fields: ProcessFieldDefinition[];
  /** Work item types that should receive the custom fields */
  workItemTypes: string[];
  /** Optional custom layout pages for WIT forms */
  layoutPages?: ProcessLayoutPage[];
}
