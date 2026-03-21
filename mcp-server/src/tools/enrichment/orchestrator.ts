import { createHash } from "node:crypto";

import { logger } from "../../logger.js";
import {
  calculateQualityScore,
  detectConsistencyIssues,
  detectDependencies,
  detectMissingPieces,
  estimateEffort,
  generateDefinitionOfDone,
  scoreConfidence,
} from "./stages.js";
import { EnrichmentContext, EnrichmentFlags, EnrichmentResult, EnrichmentWorkItem } from "./types.js";

const enrichmentCache = new Map<string, EnrichmentResult>();

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function buildIdempotencyKey(context: EnrichmentContext, items: EnrichmentWorkItem[], flags: EnrichmentFlags): string {
  const canonical = stableStringify({ context, items, flags });
  return createHash("sha256").update(canonical).digest("hex");
}

function defaultResult(items: EnrichmentWorkItem[], idempotencyKey: string): EnrichmentResult {
  return { items, warnings: [], idempotencyKey };
}

export function enrichGeneratedWorkItems(
  context: EnrichmentContext,
  items: EnrichmentWorkItem[],
  flags: EnrichmentFlags
): EnrichmentResult {
  const idempotencyKey = buildIdempotencyKey(context, items, flags);
  const existing = enrichmentCache.get(idempotencyKey);
  if (existing) {
    logger.info("Using cached enrichment result", { idempotencyKey, itemCount: items.length });
    return existing;
  }

  if (!flags.enabled) {
    const base = defaultResult(items, idempotencyKey);
    enrichmentCache.set(idempotencyKey, base);
    return base;
  }

  const output = items.map((item) => ({ ...item, enrichment: { ...(item.enrichment ?? {}) } }));
  const warnings: string[] = [];

  try {
    if (flags.dependencies) {
      const dependencies = detectDependencies(output);
      dependencies.forEach((dep, index) => {
        output[index].enrichment = {
          ...(output[index].enrichment ?? {}),
          dependencies: dep,
        };
      });
    }
  } catch (error) {
    warnings.push("Dependency detection failed; continuing without dependency enrichment.");
    logger.warn("Dependency enrichment failed", { error: String(error) });
  }

  let consistencyByItem = new Map<string, ReturnType<typeof detectConsistencyIssues> extends Map<string, infer T> ? T : never>();
  try {
    if (flags.consistency) {
      consistencyByItem = detectConsistencyIssues(output);
      for (const item of output) {
        const issues = consistencyByItem.get(item.id);
        if (!issues) continue;
        item.enrichment = {
          ...(item.enrichment ?? {}),
          consistencyIssues: issues,
        };
      }
    }
  } catch (error) {
    warnings.push("Consistency checking failed; continuing without consistency enrichment.");
    logger.warn("Consistency enrichment failed", { error: String(error) });
  }

  for (const item of output) {
    try {
      if (flags.definitionOfDone) {
        item.enrichment = {
          ...(item.enrichment ?? {}),
          definitionOfDone: generateDefinitionOfDone(item),
        };
      }

      if (flags.confidence) {
        const confidence = scoreConfidence(item);
        item.enrichment = {
          ...(item.enrichment ?? {}),
          confidence,
        };
      }

      if (flags.missingPieces) {
        const missingPieces = detectMissingPieces(item);
        item.enrichment = {
          ...(item.enrichment ?? {}),
          missingPieces,
        };
      }

      if (flags.effort) {
        const dependencyCount = item.enrichment?.dependencies?.dependsOn.length ?? 0;
        item.enrichment = {
          ...(item.enrichment ?? {}),
          effort: estimateEffort(item, dependencyCount),
        };
      }

      if (flags.quality) {
        const overallConfidence = item.enrichment?.confidence?.overall ?? 50;
        const consistencyPenalty = (item.enrichment?.consistencyIssues?.length ?? 0) * 20;
        const missingPieces = item.enrichment?.missingPieces ?? { issues: [], suggestions: [] };
        item.enrichment = {
          ...(item.enrichment ?? {}),
          qualityScore: calculateQualityScore(item, overallConfidence, consistencyPenalty, missingPieces),
        };
      }
    } catch (error) {
      warnings.push(`Enrichment failed for story '${item.title}'.`);
      logger.warn("Story enrichment stage failed", {
        storyId: item.id,
        title: item.title,
        error: String(error),
      });
    }
  }

  const result: EnrichmentResult = {
    items: output,
    warnings,
    idempotencyKey,
  };

  enrichmentCache.set(idempotencyKey, result);
  return result;
}
