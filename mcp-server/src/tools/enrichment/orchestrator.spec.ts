import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockStages = {
  calculateQualityScore: jest.fn(() => ({
    score: 75,
    breakdown: { clarity: 70, completeness: 80, testability: 75, consistency: 75 },
    issues: [],
    recommendations: [],
  })),
  detectConsistencyIssues: jest.fn(() => new Map()),
  detectDependencies: jest.fn(() => [{ dependsOn: ["2"], blocks: [], confidence: 60, rationale: ["ref"] }]),
  detectMissingPieces: jest.fn(() => ({ issues: [], suggestions: [] })),
  estimateEffort: jest.fn(() => ({ tshirtSize: "M", confidence: 80, reasoning: "test" })),
  generateDefinitionOfDone: jest.fn(() => ["done"]),
  scoreConfidence: jest.fn(() => ({ title: 70, description: 70, acceptanceCriteria: 70, overall: 70, rationale: [] })),
};

jest.mock("../../logger.js", () => ({ logger: mockLogger }));
jest.mock("./stages.js", () => mockStages);

import { enrichGeneratedWorkItems } from "./orchestrator.js";
import type { EnrichmentFlags, EnrichmentWorkItem } from "./types.js";

const fullFlags: EnrichmentFlags = {
  enabled: true,
  dependencies: true,
  definitionOfDone: true,
  confidence: true,
  missingPieces: true,
  consistency: true,
  effort: true,
  quality: true,
  aiAssist: false,
};

function makeItems(seed: string): EnrichmentWorkItem[] {
  return [
    {
      id: `${seed}-1`,
      title: `Story ${seed} one`,
      description: "A detailed story",
      acceptanceCriteria: ["Given x", "When y", "Then z"],
    },
    {
      id: `${seed}-2`,
      title: `Story ${seed} two`,
      description: "A dependency target",
      acceptanceCriteria: ["Given a", "When b", "Then c"],
    },
  ];
}

describe("enrichment orchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns base result when enrichment is disabled", () => {
    const items = makeItems("disabled");
    const result = enrichGeneratedWorkItems(
      { analysisMode: "process", transcriptContent: "x" },
      items,
      { ...fullFlags, enabled: false }
    );

    expect(result.items).toBe(items);
    expect(result.warnings).toEqual([]);
    expect(mockStages.detectDependencies).not.toHaveBeenCalled();
  });

  test("applies enrichment stages when enabled", () => {
    const items = makeItems("enabled");
    const result = enrichGeneratedWorkItems({ analysisMode: "themes" }, items, fullFlags);

    expect(result.items[0].enrichment?.dependencies?.dependsOn).toContain("2");
    expect(result.items[0].enrichment?.definitionOfDone).toEqual(["done"]);
    expect(result.items[0].enrichment?.confidence?.overall).toBe(70);
    expect(result.items[0].enrichment?.effort?.tshirtSize).toBe("M");
    expect(result.items[0].enrichment?.qualityScore?.score).toBe(75);
    expect(result.warnings).toEqual([]);
  });

  test("uses cache for same idempotency key", () => {
    const items = makeItems("cache");
    const context = { analysisMode: "themes" as const, transcriptContent: "cache text" };

    const first = enrichGeneratedWorkItems(context, items, fullFlags);
    const second = enrichGeneratedWorkItems(context, items, fullFlags);

    expect(second).toBe(first);
    expect(mockStages.detectDependencies).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith("Using cached enrichment result", expect.any(Object));
  });

  test("captures dependency-stage failures and continues", () => {
    mockStages.detectDependencies.mockImplementationOnce(() => {
      throw new Error("dependency failure");
    });

    const result = enrichGeneratedWorkItems({ analysisMode: "process" }, makeItems("warn"), fullFlags);

    expect(result.warnings).toContain("Dependency detection failed; continuing without dependency enrichment.");
    expect(result.items[0].enrichment?.confidence?.overall).toBe(70);
    expect(mockLogger.warn).toHaveBeenCalledWith("Dependency enrichment failed", expect.any(Object));
  });
});
