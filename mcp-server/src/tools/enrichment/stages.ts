import {
  EnrichmentWorkItem,
  TShirtSize,
  WorkItemConsistencyIssue,
  WorkItemDependencies,
  WorkItemEffort,
  WorkItemMissingPieces,
  WorkItemQualityScore,
} from "./types.js";

const dependencyTerms = ["after", "before", "depends on", "requires", "once", "until", "only if", "blocked by"];
const vagueTerms = ["fast", "easy", "seamless", "user-friendly", "quickly", "etc", "somehow", "appropriate"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function norm(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, " ").trim();
}

function tokenise(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 2)
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const token of a) {
    if (b.has(token)) common++;
  }
  const base = Math.min(a.size, b.size);
  return common / base;
}

export function detectDependencies(items: EnrichmentWorkItem[]): WorkItemDependencies[] {
  const tokensById = new Map(items.map((item) => [item.id, tokenise(`${item.title} ${item.description}`)]));

  return items.map((item) => {
    const dependsOn: string[] = [];
    const blocks: string[] = [];
    const rationale: string[] = [];

    const ownText = `${item.title} ${item.description}`.toLowerCase();
    const ownTokens = tokensById.get(item.id) ?? new Set<string>();

    for (const other of items) {
      if (other.id === item.id) continue;
      const otherTitleNorm = norm(other.title);
      const otherTokens = tokensById.get(other.id) ?? new Set<string>();
      const overlap = overlapScore(ownTokens, otherTokens);

      const referencesOther = ownText.includes(otherTitleNorm) && otherTitleNorm.length > 4;
      const hasOrderCue = dependencyTerms.some((term) => ownText.includes(term));

      if (referencesOther && hasOrderCue) {
        dependsOn.push(other.id);
        rationale.push(`Story mentions '${other.title}' with dependency cue.`);
        continue;
      }

      if (overlap >= 0.65 && hasOrderCue) {
        dependsOn.push(other.id);
        rationale.push(`High entity overlap with '${other.title}' and ordering language.`);
      }

      if (ownText.includes("block") && overlap >= 0.5) {
        blocks.push(other.id);
        rationale.push(`Potential blocker relation with '${other.title}'.`);
      }
    }

    const raw = dependsOn.length * 30 + blocks.length * 20 + (rationale.length > 0 ? 20 : 0);
    return {
      dependsOn: Array.from(new Set(dependsOn)),
      blocks: Array.from(new Set(blocks)),
      confidence: clamp(raw, 0, 100),
      rationale: rationale.slice(0, 5),
    };
  });
}

function detectStoryType(item: EnrichmentWorkItem): "ui" | "api" | "data" | "workflow" | "general" {
  const text = `${item.title} ${item.description}`.toLowerCase();
  if (/(ui|screen|page|button|layout|frontend|responsive|accessibility)/.test(text)) return "ui";
  if (/(api|endpoint|integration|webhook|service|auth|authori)/.test(text)) return "api";
  if (/(data|schema|migration|table|database|etl|field)/.test(text)) return "data";
  if (/(workflow|automation|trigger|approval|notification|orchestrat)/.test(text)) return "workflow";
  return "general";
}

export function generateDefinitionOfDone(item: EnrichmentWorkItem): string[] {
  const type = detectStoryType(item);
  if (type === "ui") {
    return [
      "UI implemented as described",
      "Responsive behaviour verified",
      "Accessibility checks completed",
      "Error and empty states handled",
    ];
  }

  if (type === "api") {
    return [
      "Endpoint or integration implemented",
      "Authentication and authorisation validated",
      "Error handling implemented",
      "Logging and monitoring considered",
      "Contract tested",
    ];
  }

  if (type === "data") {
    return [
      "Data model changes implemented",
      "Migration/backfill approach documented",
      "Validation and integrity checks added",
      "Rollback and recovery considered",
    ];
  }

  if (type === "workflow") {
    return [
      "Trigger and actions configured",
      "Failure handling covered",
      "Auditability confirmed",
      "Notifications tested if applicable",
    ];
  }

  return [
    "Implementation completed and peer reviewed",
    "Acceptance criteria verified",
    "Error handling covered",
    "Operational visibility considered",
  ];
}

export function scoreConfidence(item: EnrichmentWorkItem): { title: number; description: number; acceptanceCriteria: number; overall: number; rationale: string[] } {
  const rationale: string[] = [];

  let title = 55;
  if (item.title.trim().length >= 15) title += 15;
  if (/implement|support|enable|validate|integrate/i.test(item.title)) title += 10;
  if (vagueTerms.some((term) => item.title.toLowerCase().includes(term))) {
    title -= 20;
    rationale.push("Title contains vague wording.");
  }

  let description = 45;
  if (item.description.length >= 120) description += 20;
  if (/as a .* i need .* so that /i.test(item.description)) description += 15;
  if (/error|edge|audit|security|performance/i.test(item.description)) description += 10;
  if (vagueTerms.some((term) => item.description.toLowerCase().includes(term))) {
    description -= 15;
    rationale.push("Description includes vague terms without measurable outcomes.");
  }

  let acceptanceCriteria = 35;
  if (item.acceptanceCriteria.length >= 3) acceptanceCriteria += 30;
  if (item.acceptanceCriteria.some((criterion) => /given|when|then/i.test(criterion))) acceptanceCriteria += 20;
  if (item.acceptanceCriteria.some((criterion) => /verify|measure|assert|test/i.test(criterion))) acceptanceCriteria += 10;
  if (item.acceptanceCriteria.length === 0) {
    rationale.push("No acceptance criteria present.");
    acceptanceCriteria = 10;
  }

  title = clamp(title, 0, 100);
  description = clamp(description, 0, 100);
  acceptanceCriteria = clamp(acceptanceCriteria, 0, 100);
  const overall = Math.round(title * 0.25 + description * 0.35 + acceptanceCriteria * 0.4);

  return { title, description, acceptanceCriteria, overall, rationale };
}

export function detectMissingPieces(item: EnrichmentWorkItem): WorkItemMissingPieces {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const text = `${item.title} ${item.description}`.toLowerCase();

  if (item.acceptanceCriteria.length < 2) {
    issues.push("Acceptance criteria are missing or too few.");
    suggestions.push("Add at least 3 testable Given/When/Then acceptance criteria.");
  }

  if (!/error|failure|exception/.test(text)) {
    issues.push("No error handling expectations found.");
    suggestions.push("Describe expected behaviour for failure and invalid input paths.");
  }

  if (!/edge|fallback|timeout|retry/.test(text)) {
    issues.push("Edge cases are not described.");
    suggestions.push("Include at least one edge case or fallback scenario.");
  }

  if (!/performance|security|audit|accessibility|latency/.test(text)) {
    issues.push("Non-functional considerations are absent.");
    suggestions.push("Add relevant non-functional criteria (e.g. performance, security, accessibility). ");
  }

  if (vagueTerms.some((term) => text.includes(term))) {
    issues.push("Vague wording detected.");
    suggestions.push("Replace vague terms with measurable outcomes.");
  }

  return { issues, suggestions };
}

export function detectConsistencyIssues(items: EnrichmentWorkItem[]): Map<string, WorkItemConsistencyIssue[]> {
  const result = new Map<string, WorkItemConsistencyIssue[]>();

  for (const item of items) {
    const ownIssues: WorkItemConsistencyIssue[] = [];
    const ownNorm = norm(item.title);

    for (const other of items) {
      if (item.id === other.id) continue;
      const otherNorm = norm(other.title);

      if (ownNorm === otherNorm) {
        ownIssues.push({
          conflictsWith: [other.id],
          description: `Potential duplicate intent with '${other.title}'.`,
          severity: "medium",
        });
        continue;
      }

      const ownText = `${item.title} ${item.description}`.toLowerCase();
      const otherText = `${other.title} ${other.description}`.toLowerCase();

      const ownAffirmative = /must|shall|required/.test(ownText);
      const otherNegative = /must not|should not|not required/.test(otherText);
      const highOverlap = overlapScore(tokenise(ownText), tokenise(otherText)) > 0.75;

      if (highOverlap && ownAffirmative && otherNegative) {
        ownIssues.push({
          conflictsWith: [other.id],
          description: `Potential contradiction in requirement assumptions versus '${other.title}'.`,
          severity: "high",
        });
      }
    }

    if (ownIssues.length > 0) {
      result.set(item.id, ownIssues.slice(0, 3));
    }
  }

  return result;
}

export function estimateEffort(item: EnrichmentWorkItem, dependencyCount: number): WorkItemEffort {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const criteriaCount = item.acceptanceCriteria.length;
  let points = criteriaCount * 8 + dependencyCount * 10;

  if (/(integration|api|webhook|external|jira|azure devops|cross-system)/.test(text)) points += 18;
  if (/(frontend|ui|screen)/.test(text) && /(backend|service|api)/.test(text)) points += 14;
  if (/(data|migration|schema|database)/.test(text)) points += 12;
  if (/(complex|orchestrat|workflow|automation)/.test(text)) points += 10;

  let tshirtSize: TShirtSize = "XS";
  if (points >= 70) tshirtSize = "XL";
  else if (points >= 52) tshirtSize = "L";
  else if (points >= 35) tshirtSize = "M";
  else if (points >= 20) tshirtSize = "S";

  const confidence = clamp(85 - dependencyCount * 7 + (criteriaCount >= 3 ? 5 : -8), 30, 95);
  return {
    tshirtSize,
    confidence,
    reasoning: `Estimated from ${criteriaCount} acceptance criteria, ${dependencyCount} dependencies, and detected technical scope signals.`,
  };
}

export function calculateQualityScore(
  item: EnrichmentWorkItem,
  confidenceOverall: number,
  consistencyPenalty: number,
  missingPieces: WorkItemMissingPieces
): WorkItemQualityScore {
  const clarity = clamp(confidenceOverall - 10, 0, 100);
  const completeness = clamp(100 - missingPieces.issues.length * 15, 0, 100);
  const testability = clamp(item.acceptanceCriteria.length * 20, 0, 100);
  const consistency = clamp(100 - consistencyPenalty, 0, 100);

  const score = Math.round(clarity * 0.3 + completeness * 0.3 + testability * 0.25 + consistency * 0.15);
  return {
    score,
    breakdown: { clarity, completeness, testability, consistency },
    issues: missingPieces.issues,
    recommendations: [
      ...missingPieces.suggestions,
      ...(testability < 60 ? ["Increase acceptance criteria specificity for better testability."] : []),
    ].slice(0, 6),
  };
}
