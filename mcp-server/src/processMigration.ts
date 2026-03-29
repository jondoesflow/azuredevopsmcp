import { Config } from "./config.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessMigrationConfig {
  sourceOrgUrl: string;
  sourceProject: string;
  sourceProcessName: string;
  targetOrgUrl: string;
  targetProject: string;
  sourcePat: string;
  targetPat: string;
}

interface AdoProcess {
  typeId: string;
  name: string;
  description?: string;
  parentProcessTypeId: string;
  customizationType: string;
  isDefault: boolean;
}

interface AdoWorkItemType {
  referenceName: string;
  name: string;
  description?: string;
  customization: string; // "custom" | "inherited" | "system"
  color?: string;
  icon?: string;
  isDisabled?: boolean;
  inherits?: string;
}

interface AdoField {
  referenceName: string;
  name: string;
  type: string;
  description?: string;
  customization?: string;
  required?: boolean;
  defaultValue?: string;
  allowedValues?: string[];
  allowGroups?: boolean;
  pickListId?: string;
}

interface AdoState {
  id: string;
  name: string;
  color: string;
  stateCategory: string;
  customizationType: string;
  order?: number;
}

interface AdoRule {
  id?: string;
  friendlyName?: string;
  name?: string;
  conditions: unknown[];
  actions: unknown[];
  isDisabled?: boolean;
  customizationType?: string;
}

interface AdoLayoutPage {
  id: string;
  label: string;
  order?: number;
  visible?: boolean;
  locked?: boolean;
  sections: AdoLayoutSection[];
  pageType?: number;
}

interface AdoLayoutSection {
  id: string;
  groups: AdoLayoutGroup[];
}

interface AdoLayoutGroup {
  id: string;
  label: string;
  order?: number;
  visible?: boolean;
  inherited?: boolean;
  controls: AdoLayoutControl[];
  isContribution?: boolean;
}

interface AdoLayoutControl {
  id: string;
  label?: string;
  controlType?: string;
  order?: number;
  visible?: boolean;
  inherited?: boolean;
  readOnly?: boolean;
  metadata?: string;
  watermark?: string;
  isContribution?: boolean;
  contribution?: unknown;
}

interface AdoLayout {
  pages: AdoLayoutPage[];
}

// ---------------------------------------------------------------------------
// REST helper
// ---------------------------------------------------------------------------

const API_VERSION = "7.1";

async function adoFetch<T>(
  orgUrl: string,
  pat: string,
  path: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" = "GET",
  body?: unknown,
): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${orgUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}${separator}api-version=${API_VERSION}`;

  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ADO API ${method} ${url} returned ${res.status}: ${text}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return {} as T;
}

// ---------------------------------------------------------------------------
// Pre-flight check — does the target org already have Enrichment fields?
// ---------------------------------------------------------------------------

export async function checkEnrichmentProcessExists(
  targetOrgUrl: string,
  targetPat: string,
): Promise<{ found: boolean; processId?: string; processName?: string }> {
  logger.info("Pre-flight: checking target org for Enrichment process…");

  const processList = await adoFetch<{ value: AdoProcess[] }>(
    targetOrgUrl,
    targetPat,
    "_apis/work/processes",
  );

  for (const proc of processList.value) {
    // Skip system/default processes that cannot have custom fields
    if (proc.customizationType === "system" && proc.isDefault) continue;

    let witList: { value: AdoWorkItemType[] };
    try {
      witList = await adoFetch<{ value: AdoWorkItemType[] }>(
        targetOrgUrl,
        targetPat,
        `_apis/work/processes/${proc.typeId}/workitemtypes`,
      );
    } catch {
      logger.debug(`Skipping process ${proc.name} — could not list WITs`);
      continue;
    }

    for (const wit of witList.value) {
      let fieldList: { value: AdoField[] };
      try {
        fieldList = await adoFetch<{ value: AdoField[] }>(
          targetOrgUrl,
          targetPat,
          `_apis/work/processes/${proc.typeId}/workitemtypes/${wit.referenceName}/fields`,
        );
      } catch {
        continue;
      }

      const hasEnrichment = fieldList.value.some((f) =>
        f.referenceName.includes("Enrichment"),
      );
      if (hasEnrichment) {
        logger.info("Pre-flight: Enrichment process found in target org", {
          processName: proc.name,
          processId: proc.typeId,
        });
        return { found: true, processId: proc.typeId, processName: proc.name };
      }
    }
  }

  logger.info("Pre-flight: no Enrichment process found in target org");
  return { found: false };
}

// ---------------------------------------------------------------------------
// Check whether a project uses the expected process template
// ---------------------------------------------------------------------------

export async function checkProjectProcess(
  orgUrl: string,
  pat: string,
  projectName: string,
  expectedProcessName: string,
): Promise<{ hasCorrectProcess: boolean; processName: string; expectedProcessName: string }> {
  logger.info("Checking project process template…", { projectName, expectedProcessName });

  // List all processes with their projects to find which process this project uses
  const processList = await adoFetch<{
    value: Array<AdoProcess & { projects?: Array<{ name: string; id: string }> }>;
  }>(orgUrl, pat, "_apis/work/processes?$expand=projects");

  let actualProcessName = "Unknown";

  for (const proc of processList.value) {
    const match = proc.projects?.some(
      (p) => p.name.toLowerCase() === projectName.toLowerCase(),
    );
    if (match) {
      actualProcessName = proc.name;
      break;
    }
  }

  const hasCorrectProcess = actualProcessName.toLowerCase() === expectedProcessName.toLowerCase();

  logger.info("Process check complete", {
    projectName,
    actualProcess: actualProcessName,
    expectedProcessName,
    match: hasCorrectProcess,
  });

  return {
    hasCorrectProcess,
    processName: actualProcessName,
    expectedProcessName,
  };
}

// ---------------------------------------------------------------------------
// Process migration — read from source, write to target
// ---------------------------------------------------------------------------

export async function migrateProcess(migrationConfig: ProcessMigrationConfig): Promise<{ processId: string; processName: string }> {
  const { sourceOrgUrl, sourcePat, sourceProcessName, targetOrgUrl, targetPat } = migrationConfig;

  logger.info("=== Process Migration: START ===");

  // ---- Phase 1: Read source process ----------------------------------------

  logger.info("Phase 1: Reading source process…", { sourceProcessName });

  // 1a. Find the source process by name
  const sourceProcesses = await adoFetch<{ value: AdoProcess[] }>(
    sourceOrgUrl,
    sourcePat,
    "_apis/work/processes",
  );

  const sourceProcess = sourceProcesses.value.find(
    (p) => p.name.toLowerCase() === sourceProcessName.toLowerCase(),
  );
  if (!sourceProcess) {
    throw new Error(`Source process "${sourceProcessName}" not found in ${sourceOrgUrl}`);
  }

  logger.info("Source process found", {
    name: sourceProcess.name,
    typeId: sourceProcess.typeId,
    parentProcessTypeId: sourceProcess.parentProcessTypeId,
  });

  // 1b. Determine parent process name (for matching in target)
  const parentProcess = sourceProcesses.value.find(
    (p) => p.typeId === sourceProcess.parentProcessTypeId,
  );
  const parentProcessName = parentProcess?.name ?? "Agile";
  logger.info("Parent (base) process", { parentProcessName });

  // 1c. Get all work item types
  const sourceWits = await adoFetch<{ value: AdoWorkItemType[] }>(
    sourceOrgUrl,
    sourcePat,
    `_apis/work/processes/${sourceProcess.typeId}/workitemtypes`,
  );

  // Only migrate custom or inherited (customized) WITs
  const customWits = sourceWits.value.filter(
    (w) => w.customization === "custom" || w.customization === "inherited",
  );
  logger.info(`Found ${customWits.length} custom/inherited work item types to migrate`);

  // 1d. For each WIT, gather fields, states, rules, layout
  interface WitMigrationData {
    wit: AdoWorkItemType;
    enrichmentFields: AdoField[];
    customStates: AdoState[];
    rules: AdoRule[];
    layout: AdoLayout;
  }

  const witDataList: WitMigrationData[] = [];

  for (const wit of customWits) {
    logger.info(`  Reading WIT: ${wit.name} (${wit.referenceName})`);

    // Fields — only Enrichment-prefixed custom fields
    const fields = await adoFetch<{ value: AdoField[] }>(
      sourceOrgUrl,
      sourcePat,
      `_apis/work/processes/${sourceProcess.typeId}/workitemtypes/${wit.referenceName}/fields`,
    );
    const enrichmentFields = fields.value.filter((f) =>
      f.referenceName.includes("Enrichment"),
    );

    // States — only custom ones
    const states = await adoFetch<{ value: AdoState[] }>(
      sourceOrgUrl,
      sourcePat,
      `_apis/work/processes/${sourceProcess.typeId}/workitemtypes/${wit.referenceName}/states`,
    );
    const customStates = states.value.filter(
      (s) => s.customizationType === "custom",
    );

    // Rules
    const rules = await adoFetch<{ value: AdoRule[] }>(
      sourceOrgUrl,
      sourcePat,
      `_apis/work/processes/${sourceProcess.typeId}/workitemtypes/${wit.referenceName}/rules`,
    );
    const customRules = rules.value.filter(
      (r) => r.customizationType === "custom",
    );

    // Layout
    const layout = await adoFetch<AdoLayout>(
      sourceOrgUrl,
      sourcePat,
      `_apis/work/processes/${sourceProcess.typeId}/workitemtypes/${wit.referenceName}/layout`,
    );

    witDataList.push({
      wit,
      enrichmentFields,
      customStates,
      rules: customRules,
      layout,
    });

    logger.info(`    Fields: ${enrichmentFields.length} Enrichment fields, ` +
      `States: ${customStates.length} custom, Rules: ${customRules.length} custom, ` +
      `Pages: ${layout.pages?.length ?? 0}`);
  }

  // ---- Phase 2: Write to target org ----------------------------------------

  logger.info("Phase 2: Writing to target org…");

  // 2a. Find parent process in target
  const targetProcesses = await adoFetch<{ value: AdoProcess[] }>(
    targetOrgUrl,
    targetPat,
    "_apis/work/processes",
  );

  const targetParentProcess = targetProcesses.value.find(
    (p) => p.name.toLowerCase() === parentProcessName.toLowerCase(),
  );
  if (!targetParentProcess) {
    throw new Error(
      `Parent process "${parentProcessName}" not found in target org ${targetOrgUrl}. ` +
      `Available: ${targetProcesses.value.map((p) => p.name).join(", ")}`,
    );
  }

  // 2b. Create the process
  logger.info(`Step 1/6: Creating process "${sourceProcess.name}"…`);
  const createdProcess = await adoFetch<AdoProcess>(
    targetOrgUrl,
    targetPat,
    "_apis/work/processes",
    "POST",
    {
      name: sourceProcess.name,
      parentProcessTypeId: targetParentProcess.typeId,
      description: sourceProcess.description || `Migrated from ${sourceOrgUrl}`,
    },
  );
  logger.info(`  Process created: ${createdProcess.typeId}`);

  // 2c. Create custom fields at org level (deduplicated)
  logger.info("Step 2/6: Creating custom fields at org level…");
  const createdFieldRefs = new Set<string>();

  for (const witData of witDataList) {
    for (const field of witData.enrichmentFields) {
      if (createdFieldRefs.has(field.referenceName)) continue;

      try {
        await adoFetch(
          targetOrgUrl,
          targetPat,
          "_apis/wit/fields",
          "POST",
          {
            name: field.name,
            referenceName: field.referenceName,
            type: field.type,
            description: field.description || "",
            usage: "workItem",
            readOnly: false,
            isPicklist: false,
          },
        );
        createdFieldRefs.add(field.referenceName);
        logger.info(`  Field created: ${field.referenceName}`);
      } catch (err) {
        // Field may already exist at org level — that's OK
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists") || msg.includes("VS403261")) {
          createdFieldRefs.add(field.referenceName);
          logger.info(`  Field already exists: ${field.referenceName} (skipping)`);
        } else {
          throw new Error(`Failed to create field ${field.referenceName}: ${msg}`);
        }
      }
    }
  }

  // 2d. Create/customize work item types
  logger.info("Step 3/6: Creating/customizing work item types…");

  // Map source WIT ref names → target WIT ref names (for inherited WITs the ref stays the same)
  const witRefMap = new Map<string, string>();

  for (const witData of witDataList) {
    const { wit } = witData;

    if (wit.customization === "custom") {
      // Fully custom WIT — create it
      try {
        const created = await adoFetch<AdoWorkItemType>(
          targetOrgUrl,
          targetPat,
          `_apis/work/processes/${createdProcess.typeId}/workitemtypes`,
          "POST",
          {
            name: wit.name,
            description: wit.description || "",
            color: wit.color || "009CCC",
            icon: wit.icon || "icon_list",
            inheritsFrom: wit.inherits || null,
            isDisabled: false,
          },
        );
        witRefMap.set(wit.referenceName, created.referenceName);
        logger.info(`  Created custom WIT: ${wit.name} → ${created.referenceName}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to create WIT "${wit.name}": ${msg}`);
      }
    } else {
      // Inherited WIT — it already exists in the new process, just note the ref
      witRefMap.set(wit.referenceName, wit.referenceName);
      logger.info(`  Inherited WIT (exists): ${wit.name} (${wit.referenceName})`);
    }
  }

  // 2e. Add fields to each WIT
  logger.info("Step 4/6: Adding fields to work item types…");

  for (const witData of witDataList) {
    const targetWitRef = witRefMap.get(witData.wit.referenceName) ?? witData.wit.referenceName;

    for (const field of witData.enrichmentFields) {
      try {
        await adoFetch(
          targetOrgUrl,
          targetPat,
          `_apis/work/processes/${createdProcess.typeId}/workitemtypes/${targetWitRef}/fields`,
          "POST",
          {
            referenceName: field.referenceName,
            required: field.required ?? false,
            defaultValue: field.defaultValue || "",
          },
        );
        logger.debug(`    Added field ${field.referenceName} to ${targetWitRef}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists") || msg.includes("VS403261")) {
          logger.debug(`    Field ${field.referenceName} already on ${targetWitRef} (skipping)`);
        } else {
          throw new Error(
            `Failed to add field ${field.referenceName} to WIT ${targetWitRef}: ${msg}`,
          );
        }
      }
    }
    if (witData.enrichmentFields.length > 0) {
      logger.info(`  Added ${witData.enrichmentFields.length} fields to ${witData.wit.name}`);
    }
  }

  // 2f. Apply custom states
  logger.info("Step 5/6: Applying custom states…");

  for (const witData of witDataList) {
    const targetWitRef = witRefMap.get(witData.wit.referenceName) ?? witData.wit.referenceName;

    for (const state of witData.customStates) {
      try {
        await adoFetch(
          targetOrgUrl,
          targetPat,
          `_apis/work/processes/${createdProcess.typeId}/workitemtypes/${targetWitRef}/states`,
          "POST",
          {
            name: state.name,
            color: state.color,
            stateCategory: state.stateCategory,
            order: state.order,
          },
        );
        logger.debug(`    Added state "${state.name}" to ${targetWitRef}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists")) {
          logger.debug(`    State "${state.name}" already on ${targetWitRef} (skipping)`);
        } else {
          throw new Error(
            `Failed to add state "${state.name}" to WIT ${targetWitRef}: ${msg}`,
          );
        }
      }
    }
    if (witData.customStates.length > 0) {
      logger.info(`  Added ${witData.customStates.length} states to ${witData.wit.name}`);
    }
  }

  // 2g. Apply rules
  logger.info("Step 6/6: Applying rules and layout…");

  for (const witData of witDataList) {
    const targetWitRef = witRefMap.get(witData.wit.referenceName) ?? witData.wit.referenceName;

    // Rules
    for (const rule of witData.rules) {
      try {
        await adoFetch(
          targetOrgUrl,
          targetPat,
          `_apis/work/processes/${createdProcess.typeId}/workitemtypes/${targetWitRef}/rules`,
          "POST",
          {
            name: rule.name,
            friendlyName: rule.friendlyName,
            conditions: rule.conditions,
            actions: rule.actions,
            isDisabled: rule.isDisabled ?? false,
          },
        );
        logger.debug(`    Added rule "${rule.friendlyName || rule.name}" to ${targetWitRef}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`    Could not add rule "${rule.friendlyName || rule.name}" to ${targetWitRef}: ${msg}`);
        // Rules are non-critical — warn but don't abort
      }
    }
    if (witData.rules.length > 0) {
      logger.info(`  Applied ${witData.rules.length} rules to ${witData.wit.name}`);
    }

    // Layout — apply custom pages, groups, and controls
    await migrateLayout(
      targetOrgUrl,
      targetPat,
      createdProcess.typeId,
      targetWitRef,
      witData.layout,
      witData.wit.name,
    );
  }

  logger.info("=== Process Migration: COMPLETE ===", {
    processName: sourceProcess.name,
    targetProcessId: createdProcess.typeId,
    witsProcessed: witDataList.length,
    fieldsCreated: createdFieldRefs.size,
  });

  return { processId: createdProcess.typeId, processName: sourceProcess.name };
}

// ---------------------------------------------------------------------------
// Create a new project using the migrated process
// ---------------------------------------------------------------------------

export async function createProjectWithProcess(
  orgUrl: string,
  pat: string,
  projectName: string,
  processId: string,
  description?: string,
): Promise<{ projectName: string; projectId: string }> {
  logger.info("Creating new project with enrichment process…", { projectName, processId });

  const createResult = await adoFetch<{ id: string; status: string; url: string }>(
    orgUrl,
    pat,
    "_apis/projects",
    "POST",
    {
      name: projectName,
      description: description ?? "Created by MCP Backlog Assistant with Enrichment process",
      capabilities: {
        versioncontrol: { sourceControlType: "Git" },
        processTemplate: { templateTypeId: processId },
      },
    },
  );

  // Project creation is async — poll the operation status
  const operationId = createResult.id;
  if (!operationId) {
    throw new Error("Project creation did not return an operation ID.");
  }

  logger.info("Project creation started, polling operation…", { operationId });

  const maxAttempts = 30;
  const pollIntervalMs = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const status = await adoFetch<{ id: string; status: string }>(
      orgUrl,
      pat,
      `_apis/operations/${operationId}`,
    );

    logger.debug(`  Poll ${attempt}/${maxAttempts}: status=${status.status}`);

    if (status.status === "succeeded") {
      // Get the project ID
      const project = await adoFetch<{ id: string; name: string }>(
        orgUrl,
        pat,
        `_apis/projects/${encodeURIComponent(projectName)}`,
      );
      logger.info("Project created successfully", { projectName, projectId: project.id });
      return { projectName, projectId: project.id };
    }

    if (status.status === "failed" || status.status === "cancelled") {
      throw new Error(`Project creation ${status.status}. Check Azure DevOps for details.`);
    }
  }

  throw new Error(`Project creation timed out after ${maxAttempts * pollIntervalMs / 1000}s. The project may still be provisioning — check Azure DevOps.`);
}

// ---------------------------------------------------------------------------
// Layout migration helper
// ---------------------------------------------------------------------------

async function migrateLayout(
  targetOrgUrl: string,
  targetPat: string,
  processId: string,
  witRefName: string,
  layout: AdoLayout,
  witName: string,
): Promise<void> {
  if (!layout.pages || layout.pages.length === 0) return;

  // Get the existing layout in the target so we can diff against it
  let targetLayout: AdoLayout;
  try {
    targetLayout = await adoFetch<AdoLayout>(
      targetOrgUrl,
      targetPat,
      `_apis/work/processes/${processId}/workitemtypes/${witRefName}/layout`,
    );
  } catch {
    targetLayout = { pages: [] };
  }

  const existingPageLabels = new Set(
    targetLayout.pages?.map((p) => p.label.toLowerCase()) ?? [],
  );

  for (const page of layout.pages) {
    // Skip system/inherited pages that already exist
    if (existingPageLabels.has(page.label.toLowerCase())) {
      // For existing pages, try to add custom groups/controls into them
      const targetPage = targetLayout.pages.find(
        (p) => p.label.toLowerCase() === page.label.toLowerCase(),
      );
      if (targetPage) {
        await migrateGroupsIntoPage(
          targetOrgUrl,
          targetPat,
          processId,
          witRefName,
          targetPage,
          page,
        );
      }
      continue;
    }

    // Create new page
    let createdPage: AdoLayoutPage;
    try {
      createdPage = await adoFetch<AdoLayoutPage>(
        targetOrgUrl,
        targetPat,
        `_apis/work/processes/${processId}/workitemtypes/${witRefName}/layout/pages`,
        "POST",
        {
          label: page.label,
          order: page.order,
          visible: page.visible ?? true,
          locked: page.locked ?? false,
        },
      );
      logger.debug(`    Created page "${page.label}" for ${witName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`    Could not create page "${page.label}": ${msg}`);
      continue;
    }

    // Add groups and controls to the new page's sections
    for (const section of page.sections ?? []) {
      // Use first section of created page (target assigns sections automatically)
      const targetSectionId = createdPage.sections?.[0]?.id ?? section.id;

      for (const group of section.groups ?? []) {
        await createGroupWithControls(
          targetOrgUrl,
          targetPat,
          processId,
          witRefName,
          createdPage.id,
          targetSectionId,
          group,
        );
      }
    }
  }
}

async function migrateGroupsIntoPage(
  targetOrgUrl: string,
  targetPat: string,
  processId: string,
  witRefName: string,
  targetPage: AdoLayoutPage,
  sourcePage: AdoLayoutPage,
): Promise<void> {
  const existingGroupLabels = new Set<string>();
  for (const section of targetPage.sections ?? []) {
    for (const group of section.groups ?? []) {
      if (group.label) existingGroupLabels.add(group.label.toLowerCase());
    }
  }

  for (const section of sourcePage.sections ?? []) {
    const targetSectionId = targetPage.sections?.[0]?.id ?? section.id;

    for (const group of section.groups ?? []) {
      if (group.inherited) continue; // skip inherited groups
      if (group.label && existingGroupLabels.has(group.label.toLowerCase())) continue;

      await createGroupWithControls(
        targetOrgUrl,
        targetPat,
        processId,
        witRefName,
        targetPage.id,
        targetSectionId,
        group,
      );
    }
  }
}

async function createGroupWithControls(
  targetOrgUrl: string,
  targetPat: string,
  processId: string,
  witRefName: string,
  pageId: string,
  sectionId: string,
  group: AdoLayoutGroup,
): Promise<void> {
  let createdGroup: AdoLayoutGroup;
  try {
    createdGroup = await adoFetch<AdoLayoutGroup>(
      targetOrgUrl,
      targetPat,
      `_apis/work/processes/${processId}/workitemtypes/${witRefName}/layout/pages/${pageId}/sections/${sectionId}/groups`,
      "POST",
      {
        label: group.label,
        order: group.order,
        visible: group.visible ?? true,
        isContribution: group.isContribution ?? false,
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`      Could not create group "${group.label}": ${msg}`);
    return;
  }

  for (const control of group.controls ?? []) {
    if (control.inherited) continue; // skip inherited controls

    try {
      await adoFetch(
        targetOrgUrl,
        targetPat,
        `_apis/work/processes/${processId}/workitemtypes/${witRefName}/layout/pages/${pageId}/sections/${sectionId}/groups/${createdGroup.id}/controls`,
        "POST",
        {
          id: control.id,
          label: control.label,
          controlType: control.controlType,
          order: control.order,
          visible: control.visible ?? true,
          readOnly: control.readOnly ?? false,
          metadata: control.metadata,
          watermark: control.watermark,
          isContribution: control.isContribution ?? false,
          contribution: control.contribution,
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`      Could not add control "${control.id}" to group "${group.label}": ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Orchestrator — called once at startup
// ---------------------------------------------------------------------------

export async function ensureEnrichmentProcess(config: Config): Promise<void> {
  if (!config.processMigration) {
    logger.info("Process migration: not configured (SOURCE_ADO_ORG_URL not set) — skipping pre-flight check");
    return;
  }

  const { targetOrgUrl, targetPat } = config.processMigration;

  try {
    const result = await checkEnrichmentProcessExists(targetOrgUrl, targetPat);

    if (result.found) {
      logger.info(`Process migration: Enrichment process "${result.processName}" already exists in target — no migration needed`);
      return;
    }

    logger.info("Process migration: Enrichment process not found — starting migration from source org");
    await migrateProcess(config.processMigration);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Process migration failed", err instanceof Error ? err : new Error(msg));
    throw new Error(`Process migration failed: ${msg}. Cannot continue without the Enrichment process in the target org.`);
  }
}
