import { describe, expect, test } from "@jest/globals";

import {
  calculateQualityScore,
  detectConsistencyIssues,
  detectDependencies,
  detectMissingPieces,
  estimateEffort,
  generateDefinitionOfDone,
  scoreConfidence,
} from "./stages.js";
import type { EnrichmentWorkItem } from "./types.js";

function makeItem(overrides: Partial<EnrichmentWorkItem> = {}): EnrichmentWorkItem {
  return {
    id: "1",
    title: "Implement Payment API",
    description: "As a user I need payment integration so that I can complete checkout with error handling and security.",
    acceptanceCriteria: [
      "Given valid payment details",
      "When I submit checkout",
      "Then payment is processed successfully",
    ],
    ...overrides,
  };
}

describe("enrichment stages", () => {
  test("detectDependencies finds references and ordering cues", () => {
    const a = makeItem({
      id: "A",
      title: "Implement Checkout UI",
      description:
        "This capability runs after implement payment api and depends on implement payment api for completion.",
    });
    const b = makeItem({ id: "B", title: "Implement Payment API", description: "Payment API and tokenization." });

    const deps = detectDependencies([a, b]);

    expect(deps[0].dependsOn).toContain("B");
    expect(deps[0].confidence).toBeGreaterThan(0);
    expect(deps[1].dependsOn).toEqual([]);
  });

  test("generateDefinitionOfDone returns API checklist for api work", () => {
    const dod = generateDefinitionOfDone(
      makeItem({ title: "Create order endpoint integration", description: "Create API endpoint and auth service layer" })
    );

    expect(dod).toContain("Contract tested");
    expect(dod).toContain("Authentication and authorisation validated");
  });

  test("scoreConfidence rewards detailed stories and penalizes missing AC", () => {
    const strong = scoreConfidence(
      makeItem({
        title: "Implement resilient customer onboarding workflow",
        description:
          "As a manager I need onboarding with error handling, audit logging, and security checks so that compliance is preserved.",
        acceptanceCriteria: [
          "Given valid input",
          "When onboarding starts",
          "Then account is created",
          "And test evidence is recorded",
        ],
      })
    );

    const weak = scoreConfidence(
      makeItem({
        title: "easy thing",
        description: "do something quickly",
        acceptanceCriteria: [],
      })
    );

    expect(strong.overall).toBeGreaterThan(weak.overall);
    expect(weak.rationale.join(" ")).toMatch(/No acceptance criteria present/);
  });

  test("detectMissingPieces reports expected gaps", () => {
    const result = detectMissingPieces(
      makeItem({
        title: "Implement sync",
        description: "As a user I need this quickly",
        acceptanceCriteria: ["Works"],
      })
    );

    expect(result.issues).toContain("Acceptance criteria are missing or too few.");
    expect(result.issues).toContain("No error handling expectations found.");
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  test("detectConsistencyIssues flags duplicates and contradictions", () => {
    const first = makeItem({ id: "1", title: "Enable invoice validation", description: "System must validate invoice data for every request." });
    const duplicate = makeItem({ id: "2", title: "Enable invoice validation", description: "System must validate invoice data for every request." });
    const contradiction = makeItem({
      id: "3",
      title: "Enable invoice validation flow",
      description: "System must not validate invoice data for every request and it is not required.",
    });

    const issues = detectConsistencyIssues([first, duplicate, contradiction]);

    expect(issues.get("1")?.some((i) => i.description.includes("duplicate intent"))).toBe(true);
    expect(issues.get("1")?.some((i) => i.severity === "high")).toBe(true);
  });

  test("estimateEffort returns larger size with complex signals", () => {
    const effort = estimateEffort(
      makeItem({
        title: "Integrate API and frontend workflow",
        description: "Complex orchestration with data migration and cross-system integration between UI and backend service.",
        acceptanceCriteria: ["a", "b", "c", "d", "e"],
      }),
      3
    );

    expect(["M", "L", "XL"]).toContain(effort.tshirtSize);
    expect(effort.confidence).toBeGreaterThanOrEqual(30);
  });

  test("calculateQualityScore returns bounded score and recommendations", () => {
    const item = makeItem({ acceptanceCriteria: ["one", "two"] });
    const quality = calculateQualityScore(item, 80, 20, {
      issues: ["No edge cases"],
      suggestions: ["Add edge cases"],
    });

    expect(quality.score).toBeGreaterThanOrEqual(0);
    expect(quality.score).toBeLessThanOrEqual(100);
    expect(quality.breakdown.testability).toBe(40);
    expect(quality.recommendations.length).toBeGreaterThan(0);
  });
});
