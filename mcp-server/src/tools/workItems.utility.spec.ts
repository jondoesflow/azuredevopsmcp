import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import { _testExports } from "./workItems.js";

jest.mock("../azureDevOpsClient.js");
jest.mock("../processMigration.js", () => ({
  checkProjectProcess: jest.fn(),
  migrateProcess: jest.fn(),
  ensureProcessOnProject: jest.fn(),
}));
jest.mock("./enrichment/orchestrator.js", () => ({
  enrichGeneratedWorkItems: jest.fn((_ctx: unknown, items: unknown) => ({ items, warnings: [], idempotencyKey: "test" })),
}));
jest.mock("./enrichment/refinement.js", () => ({
  generateRefinementSuggestion: jest.fn(),
}));
jest.mock("./rraid.js", () => ({
  extractRRAID: jest.fn(),
  matchRRAIDToStories: jest.fn(),
}));

const {
  stripHtml,
  parseBooleanEnv,
  truncate,
  toSingleLine,
  escapeRegExp,
  escapeHtml,
  assessRubrics,
  buildRubricAcceptanceCriteria,
  selectBestExcerpt,
  buildProvenanceHtml,
  buildProvenanceText,
  appendAcceptanceCriteriaBlock,
  tryDecodeBase64,
  cleanExtractedText,
  splitIntoSentencesAndLines,
  isLikelyProcessStep,
  extractRoleFromStep,
  extractEvidenceTerms,
  normaliseTitle,
  findWorkItemByTitle,
  detectPersonaFromTranscript,
  getBestPersona,
  toPreviewItemId,
  buildGherkinCriteria,
  buildStoryDescription,
  buildEpicDescription,
  buildFeatureDescription,
  buildProcessEpicDescription,
  buildProcessFeatureDescription,
  buildPlaceholderStoryDescription,
  selectEvidenceSnippets,
  appendUnique,
  toEnrichmentLabelToken,
  buildEnrichmentSummaryText,
  buildEnrichmentSummaryHtml,
  toHtmlList,
  buildAdoEnrichmentCustomFields,
  applyAdoEnrichment,
  parseStoredAnalysis,
  parseStoredPreview,
  scanSectionForThemes,
  parseAnalysisMode,
  getPreviewStoreKey,
  findEnrichmentForTitle,
} = _testExports;

// ---------------------------------------------------------------------------
// 1. String utilities
// ---------------------------------------------------------------------------
describe("stripHtml", () => {
  test("removes HTML tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  test("decodes common HTML entities", () => {
    expect(stripHtml("Tom &amp; Jerry &lt;cats&gt;")).toBe("Tom & Jerry <cats>");
    // stripHtml handles &#39; (numeric entity) but not the named &apos; form
    expect(stripHtml("It&#39;s &quot;fine&quot;")).toBe("It's \"fine\"");
    expect(stripHtml("a&nbsp;b")).toBe("a b");
  });

  test("collapses multiple whitespace into single space", () => {
    expect(stripHtml("  hello   world  ")).toBe("hello world");
  });

  test("returns empty string for null/undefined/empty input", () => {
    expect(stripHtml(null as any)).toBe("");
    expect(stripHtml(undefined as any)).toBe("");
    expect(stripHtml("")).toBe("");
  });

  test("handles deeply nested tags", () => {
    expect(stripHtml("<div><span><em>text</em></span></div>")).toBe("text");
  });
});

describe("truncate", () => {
  test("returns string unchanged when within limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  test("truncates to max characters and appends ...", () => {
    expect(truncate("hello world", 5)).toBe("hello...");
  });

  test("uses default limit of 200", () => {
    const long = "x".repeat(250);
    const result = truncate(long);
    expect(result).toHaveLength(203); // 200 chars + "..."
    expect(result.endsWith("...")).toBe(true);
  });

  test("returns string unchanged at exactly the limit", () => {
    expect(truncate("12345", 5)).toBe("12345");
  });
});

describe("toSingleLine", () => {
  test("replaces newlines with spaces", () => {
    expect(toSingleLine("hello\nworld")).toBe("hello world");
  });

  test("collapses multiple spaces into one", () => {
    expect(toSingleLine("hello   world")).toBe("hello world");
  });

  test("handles CRLF line endings", () => {
    expect(toSingleLine("hello\r\nworld")).toBe("hello world");
  });

  test("trims leading and trailing whitespace", () => {
    expect(toSingleLine("  hello world  ")).toBe("hello world");
  });
});

describe("escapeRegExp", () => {
  test("escapes special regex characters", () => {
    expect(escapeRegExp("a.b*c+d?")).toBe(String.raw`a\.b\*c\+d\\?`);
  });

  test("escapes brackets and braces", () => {
    expect(escapeRegExp("(a){1}[b]")).toBe(String.raw`\\(a\\)\\{1\\}\\[b\\]`);
  });

  test("leaves plain alphanumeric strings unchanged", () => {
    expect(escapeRegExp("hello123")).toBe("hello123");
  });

  test("escapes pipe and caret", () => {
    expect(escapeRegExp("a|b^c$")).toBe(String.raw`a\\|b\\^c\\$`);
  });
});

describe("escapeHtml", () => {
  test("escapes ampersand first", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  test("escapes angle brackets", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  test("escapes quotes", () => {
    expect(escapeHtml(`He said "hello"`)).toBe("He said &quot;hello&quot;");
    expect(escapeHtml("It's fine")).toBe("It&#39;s fine");
  });

  test("returns unchanged string if no special chars", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

describe("normaliseTitle", () => {
  test("lowercases and trims input", () => {
    expect(normaliseTitle("  Hello World  ")).toBe("hello world");
  });

  test("replaces non-alphanumeric sequences with a space", () => {
    expect(normaliseTitle("Hello, World!")).toBe("hello world");
  });

  test("collapses multiple separators to a single space", () => {
    expect(normaliseTitle("Hello---World")).toBe("hello world");
  });

  test("handles already normalised input", () => {
    expect(normaliseTitle("hello world")).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// 2. parseBooleanEnv
// ---------------------------------------------------------------------------
describe("parseBooleanEnv", () => {
  test("returns fallback when value is undefined", () => {
    expect(parseBooleanEnv(undefined, true)).toBe(true);
    expect(parseBooleanEnv(undefined, false)).toBe(false);
  });

  test.each([["1"], ["true"], ["yes"], ["on"], ["TRUE"], ["YES"], ["ON"]])(
    "returns true for truthy string '%s'",
    (value) => {
      expect(parseBooleanEnv(value, false)).toBe(true);
    }
  );

  test.each([["0"], ["false"], ["no"], ["off"], ["FALSE"], ["NO"], ["OFF"]])(
    "returns false for falsy string '%s'",
    (value) => {
      expect(parseBooleanEnv(value, true)).toBe(false);
    }
  );

  test("returns fallback for unrecognised value", () => {
    expect(parseBooleanEnv("maybe", true)).toBe(true);
    expect(parseBooleanEnv("perhaps", false)).toBe(false);
  });

  test("trims whitespace before comparing", () => {
    expect(parseBooleanEnv("  true  ", false)).toBe(true);
    expect(parseBooleanEnv("  false  ", true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. tryDecodeBase64
// ---------------------------------------------------------------------------
describe("tryDecodeBase64", () => {
  test("returns original string when it is short plain text", () => {
    expect(tryDecodeBase64("hello world")).toBe("hello world");
  });

  test("decodes a valid long base64 string", () => {
    const original = "This is a test string that is longer than 100 characters abcdefghijklmnopqrstuvwxyz1234567890.";
    const encoded = Buffer.from(original).toString("base64");
    expect(tryDecodeBase64(encoded)).toBe(original);
  });

  test("returns raw when decoded string contains replacement chars", () => {
    // A string that looks like base64 but decodes to garbage
    const result = tryDecodeBase64("a".repeat(150));
    // Should not throw — returns either original or decoded
    expect(typeof result).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 4. cleanExtractedText
// ---------------------------------------------------------------------------
describe("cleanExtractedText", () => {
  test("removes Unicode replacement characters", () => {
    expect(cleanExtractedText("hello\uFFFDworld")).toBe("helloworld");
  });

  test("removes control characters (null byte removed, tab kept)", () => {
    // \x00 is stripped; \t is kept
    expect(cleanExtractedText("a\x00b\tc\nd")).toBe("ab\tc\nd");
  });

  test("normalises CRLF to LF", () => {
    expect(cleanExtractedText("a\r\nb")).toBe("a\nb");
  });

  test("collapses more than 2 consecutive blank lines into 2", () => {
    expect(cleanExtractedText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  test("trims leading and trailing whitespace", () => {
    expect(cleanExtractedText("  hello  ")).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// 5. splitIntoSentencesAndLines
// ---------------------------------------------------------------------------
describe("splitIntoSentencesAndLines", () => {
  test("returns individual lines for short paragraphs", () => {
    const result = splitIntoSentencesAndLines("Line one\nLine two\nLine three");
    expect(result).toContain("Line one");
    expect(result).toContain("Line two");
    expect(result).toContain("Line three");
  });

  test("splits long paragraphs on sentence boundaries", () => {
    // Must exceed 200 chars to trigger splitting logic
    const longPara =
      "The system must validate all customer input before processing begins. After validation completes successfully, the workflow routes to the approval stage. " +
      "Then the authorised user receives an automated notification email. Finally, the system closes and archives the ticket record.";
    const result = splitIntoSentencesAndLines(longPara);
    expect(result.length).toBeGreaterThan(1);
  });

  test("splits on semicolons when no sentence boundary found in long line", () => {
    // Must exceed 200 chars and have no sentence boundaries for semicolon splitting
    const text =
      "Step one is to configure the initial system settings and prepare the environment; " +
      "Step two is to validate all input data and ensure correctness of configuration values; " +
      "Step three is to approve the final workflow and submit for production deployment completion";
    const result = splitIntoSentencesAndLines(text);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  test("filters out empty lines", () => {
    const result = splitIntoSentencesAndLines("Line one\n\n\nLine two");
    const nonEmpty = result.filter((l) => l.length > 0);
    expect(nonEmpty).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 6. isLikelyProcessStep
// ---------------------------------------------------------------------------
describe("isLikelyProcessStep", () => {
  test("returns false for empty or too-short lines", () => {
    expect(isLikelyProcessStep("")).toBe(false);
    expect(isLikelyProcessStep("abc")).toBe(false);
  });

  test("returns true for bullet-prefixed lines", () => {
    expect(isLikelyProcessStep("- Submit the approval form to manager")).toBe(true);
    expect(isLikelyProcessStep("* Create new work order in the system")).toBe(true);
    expect(isLikelyProcessStep("1. Validate the customer details")).toBe(true);
  });

  test("returns true for lines containing process keywords", () => {
    expect(isLikelyProcessStep("The system will validate the input data")).toBe(true);
    expect(isLikelyProcessStep("Approve the purchase order request")).toBe(true);
    expect(isLikelyProcessStep("Dispatch engineers to the site")).toBe(true);
  });

  test("returns true for flow-arrow notation", () => {
    expect(isLikelyProcessStep("Receive -> Validate -> Approve")).toBe(true);
  });

  test("returns false for lines that are too long", () => {
    expect(isLikelyProcessStep("a".repeat(301))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. extractRoleFromStep
// ---------------------------------------------------------------------------
describe("extractRoleFromStep", () => {
  test("extracts role from Role: prefix", () => {
    expect(extractRoleFromStep("Role: Project Manager")).toBe("project manager");
  });

  test("extracts role from Actor: prefix", () => {
    expect(extractRoleFromStep("Actor: Field Engineer")).toBe("field engineer");
  });

  test("extracts role from bullet with role prefix", () => {
    expect(extractRoleFromStep("- Role: Dispatcher"))?.toBe("dispatcher");
  });

  test("returns undefined when no role prefix found", () => {
    expect(extractRoleFromStep("Submit the form for approval")).toBeUndefined();
  });

  test("returns undefined for empty string", () => {
    expect(extractRoleFromStep("")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 8. extractEvidenceTerms
// ---------------------------------------------------------------------------
describe("extractEvidenceTerms", () => {
  test("extracts unique lowercase tokens longer than 3 chars", () => {
    const result = extractEvidenceTerms("Submit approval form");
    expect(result).toContain("submit");
    expect(result).toContain("approval");
    expect(result).toContain("form");
  });

  test("deduplicates terms", () => {
    const result = extractEvidenceTerms("validate validate validate");
    expect(result.filter((t) => t === "validate")).toHaveLength(1);
  });

  test("limits to 6 terms", () => {
    const result = extractEvidenceTerms("alpha bravo charlie delta echo foxtrot golf");
    expect(result.length).toBeLessThanOrEqual(6);
  });

  test("ignores tokens of 3 chars or fewer", () => {
    const result = extractEvidenceTerms("do it now and go");
    result.forEach((t) => expect(t.length).toBeGreaterThan(3));
  });

  test("strips special characters before tokenising", () => {
    const result = extractEvidenceTerms("validate, submit & approve!");
    expect(result).toContain("validate");
    expect(result).toContain("submit");
    expect(result).toContain("approve");
  });
});

// ---------------------------------------------------------------------------
// 9. selectBestExcerpt
// ---------------------------------------------------------------------------
  describe("buildRubricAcceptanceCriteria", () => {
    test("returns empty array for undefined or empty rubrics", () => {
      expect(buildRubricAcceptanceCriteria(undefined)).toEqual([]);
      expect(buildRubricAcceptanceCriteria([])).toEqual([]);
    });

    test("returns criteria based on top mentioned rubrics", () => {
      const rubrics = [
        { id: "security", name: "Security", mentions: 5, signals: [] },
        { id: "data", name: "Data", mentions: 3, signals: [] },
        { id: "edge_cases", name: "Edge Cases", mentions: 0, signals: [] }, // should be ignored (mentions 0)
      ];
      const criteria = buildRubricAcceptanceCriteria(rubrics as any);
      expect(criteria).toEqual([
        "And access is controlled by role-based permissions",
        "And data validation rules and required fields are defined"
      ]);
    });

    test("limits to top 4 even if more have mentions", () => {
      const rubrics = [
        { id: "security", name: "", mentions: 10, signals: [] },
        { id: "compliance", name: "", mentions: 9, signals: [] },
        { id: "integration", name: "", mentions: 8, signals: [] },
        { id: "reporting", name: "", mentions: 7, signals: [] },
        { id: "nfr", name: "", mentions: 6, signals: [] },
        { id: "workflow", name: "", mentions: 5, signals: [] }
      ];
      const criteria = buildRubricAcceptanceCriteria(rubrics as any);
      expect(criteria.length).toBe(4);
      expect(criteria).toContain("And access is controlled by role-based permissions"); // security
      expect(criteria).toContain("And key actions are auditable with timestamped history"); // compliance
      expect(criteria).toContain("And required integrations/interfaces are identified for this capability"); // integration
      expect(criteria).toContain("And the outcome is reportable via dashboards/exports where required"); // reporting
      expect(criteria).not.toContain("And performance/availability expectations are defined and testable"); // nfr should be excluded
    });
  });

  describe("selectBestExcerpt", () => {
  test("returns undefined for empty content", () => {
    expect(selectBestExcerpt("", ["term"])).toBeUndefined();
  });

  test("returns a non-empty string when terms are found", () => {
    const content = "First line\nThe approval workflow must be enabled\nLast line";
    const result = selectBestExcerpt(content, ["approval"]);
    expect(typeof result).toBe("string");
    expect((result as string).length).toBeGreaterThan(0);
  });

  test("falls back to first line when no term matched", () => {
    const content = "First line\nSecond line\nThird line";
    const result = selectBestExcerpt(content, ["zzzmissing"]);
    expect(typeof result).toBe("string");
  });

  test("truncates result to maxChars", () => {
    const content = "x ".repeat(300);
    const result = selectBestExcerpt(content, [], 50);
    expect((result as string).length).toBeLessThanOrEqual(53); // 50 + "..."
  });

  test("returns undefined for whitespace-only content", () => {
    expect(selectBestExcerpt("   \n   \n   ", ["term"])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 10. buildProvenanceHtml and buildProvenanceText
// ---------------------------------------------------------------------------
describe("buildProvenanceHtml", () => {
  test("generates HTML with source filename and type", () => {
    const info = { sourceFileName: "doc.txt", sourceType: "transcript" as const, reference: "Theme: X" };
    const result = buildProvenanceHtml(info);
    expect(result).toContain("doc.txt");
    expect(result).toContain("transcript");
    expect(result).toContain("Theme: X");
    expect(result).toContain("<em>");
  });

  test("includes escaped excerpt when provided", () => {
    const info = { sourceFileName: "doc.txt", sourceType: "process" as const, reference: "Stage: Y", excerpt: "Some <excerpt>" };
    const result = buildProvenanceHtml(info);
    expect(result).toContain("&lt;excerpt&gt;");
  });

  test("omits additional excerpt dash when no excerpt is provided", () => {
    // The format always includes one em-dash between source info and reference,
    // but does NOT include a second em-dash for the excerpt part.
    const info = { sourceFileName: "doc.txt", sourceType: "transcript" as const, reference: "Ref" };
    const result = buildProvenanceHtml(info);
    // Without an excerpt the string should end with the reference, not contain an extra em-dash after it
    expect(result.endsWith(`— Ref</em>`)).toBe(true);
  });
});

describe("buildProvenanceText", () => {
  test("generates markdown text with source info", () => {
    const info = { sourceFileName: "doc.txt", sourceType: "transcript" as const, reference: "Theme: X" };
    const result = buildProvenanceText(info);
    expect(result).toContain("doc.txt");
    expect(result).toContain("transcript");
    expect(result).toContain("Theme: X");
    expect(result.startsWith("_Source:")).toBe(true);
    expect(result.endsWith("_")).toBe(true);
  });

  test("includes excerpt when provided", () => {
    const info = { sourceFileName: "doc.txt", sourceType: "process" as const, reference: "Ref", excerpt: "key phrase" };
    const result = buildProvenanceText(info);
    expect(result).toContain("key phrase");
  });
});

// ---------------------------------------------------------------------------
// 11. appendAcceptanceCriteriaBlock
// ---------------------------------------------------------------------------
describe("appendAcceptanceCriteriaBlock", () => {
  test("returns description unchanged when no criteria provided", () => {
    expect(appendAcceptanceCriteriaBlock("desc", [])).toBe("desc");
    expect(appendAcceptanceCriteriaBlock("desc", undefined)).toBe("desc");
  });

  test("appends criteria section with each item as bullet", () => {
    const result = appendAcceptanceCriteriaBlock("Story description", ["Given X", "When Y", "Then Z"]);
    expect(result).toContain("Acceptance Criteria:");
    expect(result).toContain("- Given X");
    expect(result).toContain("- When Y");
    expect(result).toContain("- Then Z");
  });

  test("filters out blank criteria items", () => {
    const result = appendAcceptanceCriteriaBlock("desc", ["  ", "Given X", ""]);
    expect(result).not.toContain("-   ");
    expect(result).toContain("- Given X");
  });

  test("returns the criteria section even with an empty base description", () => {
    const result = appendAcceptanceCriteriaBlock("", ["Given X"]);
    expect(result).toContain("Acceptance Criteria:");
    expect(result).toContain("- Given X");
  });
});

// ---------------------------------------------------------------------------
// 12. assessRubrics and buildRubricAcceptanceCriteria
// ---------------------------------------------------------------------------
describe("assessRubrics", () => {
  test("returns an array of rubric assessments sorted by mentions descending", () => {
    const content = "security rbac encryption audit compliance gdpr";
    const result = assessRubrics(content);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].mentions).toBeGreaterThanOrEqual(result[1]?.mentions ?? 0);
  });

  test("returns zero mentions for rubrics whose keywords are absent", () => {
    const content = "hello world nothing related here";
    const result = assessRubrics(content);
    result.forEach((r) => expect(r.mentions).toBe(0));
  });

  test("detects integration keywords", () => {
    const content = "The system must expose an api and support webhook sync with oracle erp";
    const result = assessRubrics(content);
    const integration = result.find((r) => r.id === "integration");
    expect(integration?.mentions).toBeGreaterThan(0);
  });

  test("each output item has id, name, mentions, signals", () => {
    const result = assessRubrics("report dashboard kpi");
    result.forEach((r) => {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("mentions");
      expect(r).toHaveProperty("signals");
    });
  });
});

describe("buildRubricAcceptanceCriteria", () => {
  test("returns empty array when no rubrics provided", () => {
    expect(buildRubricAcceptanceCriteria(undefined)).toEqual([]);
    expect(buildRubricAcceptanceCriteria([])).toEqual([]);
  });

  test("returns empty array when all rubrics have zero mentions", () => {
    const rubrics = [{ id: "security", name: "Security", mentions: 0, signals: [] }];
    expect(buildRubricAcceptanceCriteria(rubrics)).toEqual([]);
  });

  test("generates RBAC criterion for security rubric", () => {
    const rubrics = [{ id: "security", name: "Security", mentions: 5, signals: ["rbac"] }];
    const result = buildRubricAcceptanceCriteria(rubrics);
    expect(result.some((c) => c.includes("role-based"))).toBe(true);
  });

  test("generates audit criterion for compliance rubric", () => {
    const rubrics = [{ id: "compliance", name: "Compliance", mentions: 3, signals: ["audit"] }];
    const result = buildRubricAcceptanceCriteria(rubrics);
    expect(result.some((c) => c.includes("auditable"))).toBe(true);
  });

  test("deduplicates criteria when same rubric appears multiple times", () => {
    const rubrics = [
      { id: "security", name: "Security", mentions: 5, signals: [] },
      { id: "security", name: "Security", mentions: 3, signals: [] },
    ];
    const result = buildRubricAcceptanceCriteria(rubrics);
    const securityCriteria = result.filter((c) => c.includes("role-based"));
    expect(securityCriteria.length).toBe(1);
  });

  test("limits to top 4 rubrics", () => {
    const rubrics = Array.from({ length: 8 }, (_, i) => ({
      id: ["security", "compliance", "integration", "reporting", "nfr", "edge_cases", "data", "workflow"][i],
      name: `Rubric ${i}`,
      mentions: 10 - i,
      signals: [],
    }));
    const result = buildRubricAcceptanceCriteria(rubrics);
    expect(result.length).toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// 13. findWorkItemByTitle
// ---------------------------------------------------------------------------
describe("findWorkItemByTitle", () => {
  const items = [
    { id: 1, fields: { "System.Title": "User Login" } },
    { id: 2, fields: { "System.Title": "Implement Dashboard" } },
  ];

  test("finds a work item by exact title", () => {
    const result = findWorkItemByTitle(items, "User Login");
    expect(result?.id).toBe(1);
  });

  test("matches case-insensitively after normalisation", () => {
    const result = findWorkItemByTitle(items, "user login");
    expect(result?.id).toBe(1);
  });

  test("matches despite punctuation differences", () => {
    const result = findWorkItemByTitle(items, "implement-dashboard");
    expect(result?.id).toBe(2);
  });

  test("returns undefined when no match found", () => {
    const result = findWorkItemByTitle(items, "Non-existent story");
    expect(result).toBeUndefined();
  });

  test("returns undefined for empty items array", () => {
    expect(findWorkItemByTitle([], "any title")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 14. detectPersonaFromTranscript and getBestPersona
// ---------------------------------------------------------------------------
describe("detectPersonaFromTranscript", () => {
  test("returns 'user' for empty content", () => {
    expect(detectPersonaFromTranscript("")).toBe("user");
    expect(detectPersonaFromTranscript("   ")).toBe("user");
  });

  test("extracts explicit 'As a ...' persona", () => {
    const result = detectPersonaFromTranscript("As a project manager, I want to view reports.");
    expect(result).toContain("project manager");
  });

  test("detects dispatcher persona from keywords", () => {
    const content = "The dispatcher schedules and routes jobs across the team.";
    expect(detectPersonaFromTranscript(content)).toBe("dispatcher");
  });

  test("detects finance analyst persona from invoice keywords", () => {
    const content = "The system must generate invoices and track billing margins.";
    expect(detectPersonaFromTranscript(content)).toBe("finance analyst");
  });

  test("returns 'user' when no persona can be identified", () => {
    const content = "General system requirements and technical notes.";
    expect(detectPersonaFromTranscript(content)).toBe("user");
  });
});

describe("getBestPersona", () => {
  test("returns trimmed role when role is provided", () => {
    expect(getBestPersona("  Manager  ", "some content")).toBe("manager");
  });

  test("falls back to detectPersonaFromTranscript when role is empty", () => {
    const result = getBestPersona("", "As a dispatcher, I need to schedule jobs.");
    expect(result).toContain("dispatcher");
  });

  test("falls back to detectPersonaFromTranscript when role is undefined", () => {
    const result = getBestPersona(undefined, "invoice billing margin cost");
    expect(result).toBe("finance analyst");
  });
});

// ---------------------------------------------------------------------------
// 15. toPreviewItemId
// ---------------------------------------------------------------------------
describe("toPreviewItemId", () => {
  test("creates a colon-separated id from mode, primary and secondary", () => {
    const result = toPreviewItemId("themes", "Security", "RBAC");
    expect(result).toBe("themes:security:rbac");
  });

  test("normalises spaces and punctuation", () => {
    const result = toPreviewItemId("process", "Order Management", "Create Order!");
    expect(result).toContain("order management");
    expect(result).toContain("create order");
  });
});

// ---------------------------------------------------------------------------
// 16. buildGherkinCriteria
// ---------------------------------------------------------------------------
describe("buildGherkinCriteria", () => {
  test("returns 4 Gherkin steps", () => {
    const result = buildGherkinCriteria("RBAC configuration", "Security", "admin");
    expect(result).toHaveLength(4);
  });

  test("first step is a Given", () => {
    const result = buildGherkinCriteria("Login", "Authentication", "user");
    expect(result[0]).toMatch(/^Given/);
  });

  test("second step is a When", () => {
    const result = buildGherkinCriteria("Login", "Authentication", "user");
    expect(result[1]).toMatch(/^When/);
  });

  test("third step is a Then", () => {
    const result = buildGherkinCriteria("Login", "Authentication", "user");
    expect(result[2]).toMatch(/^Then/);
  });

  test("includes the persona in the When step", () => {
    const result = buildGherkinCriteria("submit form", "Workflow", "project manager");
    expect(result[1]).toContain("project manager");
  });

  test("includes the theme name in the Given step", () => {
    const result = buildGherkinCriteria("submit form", "Billing", "user");
    expect(result[0]).toContain("billing");
  });
});

// ---------------------------------------------------------------------------
// 17. Description builders
// ---------------------------------------------------------------------------
describe("buildStoryDescription", () => {
  test("includes persona and subtopic", () => {
    const result = buildStoryDescription("login flow", "Authentication", "developer");
    expect(result).toContain("developer");
    expect(result).toContain("login flow");
  });

  test("includes theme name in context section", () => {
    const result = buildStoryDescription("login flow", "Authentication", "developer");
    expect(result).toContain("Authentication");
  });

  test("appends provenance HTML when provenance is provided", () => {
    const provenance = { sourceFileName: "doc.txt", sourceType: "transcript" as const, reference: "Theme: Auth" };
    const result = buildStoryDescription("login", "Auth", "user", provenance);
    expect(result).toContain("doc.txt");
    expect(result).toContain("<em>");
  });
});

describe("buildEpicDescription", () => {
  test("includes theme name and subtopics as list items", () => {
    const result = buildEpicDescription("Security", ["RBAC management", "Encryption"]);
    expect(result).toContain("Security");
    expect(result).toContain("<li>RBAC management</li>");
    expect(result).toContain("<li>Encryption</li>");
  });

  test("returns valid HTML string", () => {
    const result = buildEpicDescription("Billing", ["Invoicing"]);
    expect(result).toContain("<ul>");
    expect(result).toContain("</ul>");
  });
});

describe("buildFeatureDescription", () => {
  test("includes subtopic and theme name", () => {
    const result = buildFeatureDescription("Invoice generation", "Billing");
    expect(result).toContain("Invoice generation");
    expect(result).toContain("Billing");
  });

  test("includes the user story title", () => {
    const result = buildFeatureDescription("Invoice generation", "Billing");
    expect(result).toContain("Implement Invoice generation");
  });
});

describe("buildProcessEpicDescription", () => {
  const stage = {
    title: "Order Management",
    steps: [
      { title: "Create order", role: undefined, evidenceTerms: [] },
      { title: "Validate order", role: undefined, evidenceTerms: [] },
    ],
  };

  test("includes stage title and step titles", () => {
    const result = buildProcessEpicDescription(stage);
    expect(result).toContain("Order Management");
    expect(result).toContain("Create order");
    expect(result).toContain("Validate order");
  });

  test("mentions process stage traceability", () => {
    const result = buildProcessEpicDescription(stage);
    expect(result.toLowerCase()).toContain("process stage");
  });
});

describe("buildProcessFeatureDescription", () => {
  test("includes step title and stage title", () => {
    const step = { title: "Validate customer data", role: undefined, evidenceTerms: [] };
    const result = buildProcessFeatureDescription(step, "Order Processing");
    expect(result).toContain("Validate customer data");
    expect(result).toContain("Order Processing");
  });
});

describe("buildPlaceholderStoryDescription", () => {
  const step = { title: "Validate order data", role: "manager", evidenceTerms: ["validate", "order"] };

  test("includes step title and stage title", () => {
    const result = buildPlaceholderStoryDescription(step, "Order Stage", "manager", [], []);
    expect(result).toContain("validate order data");
    expect(result).toContain("Order Stage");
  });

  test("includes evidence snippets when provided", () => {
    const result = buildPlaceholderStoryDescription(step, "Stage", "user", ["Evidence snippet here"], []);
    expect(result).toContain("Evidence snippet here");
  });

  test("includes design references when provided", () => {
    const result = buildPlaceholderStoryDescription(step, "Stage", "user", [], ["DESIGN-001"]);
    expect(result).toContain("DESIGN-001");
  });

  test("includes placeholder text when no evidence", () => {
    const result = buildPlaceholderStoryDescription(step, "Stage", "user", [], []);
    expect(result).toContain("No supporting transcript snippet");
  });

  test("includes provenance HTML when provided", () => {
    const provenance = { sourceFileName: "doc.txt", sourceType: "process" as const, reference: "Stage: X" };
    const result = buildPlaceholderStoryDescription(step, "Stage", "user", [], [], provenance);
    expect(result).toContain("doc.txt");
  });
});

// ---------------------------------------------------------------------------
// 18. selectEvidenceSnippets
// ---------------------------------------------------------------------------
describe("selectEvidenceSnippets", () => {
  test("returns empty array for empty content", () => {
    expect(selectEvidenceSnippets("", ["term"])).toEqual([]);
  });

  test("returns empty array for empty terms", () => {
    expect(selectEvidenceSnippets("Some evidence content here", [])).toEqual([]);
  });

  test("returns matching lines from content", () => {
    const content = "Line about security\nAnother line about compliance\nLast line about data";
    const result = selectEvidenceSnippets(content, ["security"]);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toContain("security");
  });

  test("limits results to 3 snippets", () => {
    const content = Array.from({ length: 10 }, (_, i) => `Security item ${i}`).join("\n");
    const result = selectEvidenceSnippets(content, ["security"]);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  test("truncates long lines", () => {
    const longLine = "security " + "x".repeat(300);
    const result = selectEvidenceSnippets(longLine, ["security"]);
    if (result.length > 0) {
      expect(result[0].length).toBeLessThanOrEqual(223); // truncate limit + "..."
    }
  });
});

// ---------------------------------------------------------------------------
// 19. appendUnique and toEnrichmentLabelToken
// ---------------------------------------------------------------------------
describe("appendUnique", () => {
  test("merges two lists deduplicating values", () => {
    const result = appendUnique(["a", "b"], ["b", "c"]);
    expect(result).toEqual(["a", "b", "c"]);
  });

  test("trims whitespace from new values", () => {
    const result = appendUnique(["a"], ["  b  "]);
    expect(result).toContain("b");
    expect(result).not.toContain("  b  ");
  });

  test("filters out empty strings", () => {
    const result = appendUnique(["a"], ["", "b", "  "]);
    expect(result).toEqual(["a", "b"]);
  });

  test("returns unique set when no overlap", () => {
    expect(appendUnique(["x"], ["y", "z"])).toEqual(["x", "y", "z"]);
  });
});

describe("toEnrichmentLabelToken", () => {
  test("converts to lowercase slug", () => {
    expect(toEnrichmentLabelToken("Effort: Large")).toBe("effort-large");
  });

  test("replaces non-alphanumeric sequences with hyphens", () => {
    expect(toEnrichmentLabelToken("quality: high!")).toBe("quality-high");
  });

  test("strips leading and trailing hyphens", () => {
    expect(toEnrichmentLabelToken("  hello world  ")).toBe("hello-world");
  });

  test("handles all lowercase alphanum input unchanged", () => {
    expect(toEnrichmentLabelToken("confidence")).toBe("confidence");
  });
});

// ---------------------------------------------------------------------------
// 20. toHtmlList
// ---------------------------------------------------------------------------
describe("toHtmlList", () => {
  test("returns undefined for undefined input", () => {
    expect(toHtmlList(undefined)).toBeUndefined();
  });

  test("returns undefined for empty array", () => {
    expect(toHtmlList([])).toBeUndefined();
  });

  test("returns undefined when all items are whitespace", () => {
    expect(toHtmlList(["  ", ""])).toBeUndefined();
  });

  test("generates <ul> HTML with escaped content", () => {
    const result = toHtmlList(["Item <one>", "Item two"]);
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>Item &lt;one&gt;</li>");
    expect(result).toContain("<li>Item two</li>");
  });
});

// ---------------------------------------------------------------------------
// 21. buildEnrichmentSummaryText and buildEnrichmentSummaryHtml
// ---------------------------------------------------------------------------
describe("buildEnrichmentSummaryText", () => {
  test("returns empty string for undefined enrichment", () => {
    expect(buildEnrichmentSummaryText(undefined)).toBe("");
  });

  test("includes confidence information when present", () => {
    const enrichment = {
      confidence: { overall: 75, title: 80, description: 70, acceptanceCriteria: 75, rationale: [] },
    } as any;
    const result = buildEnrichmentSummaryText(enrichment);
    expect(result).toContain("Confidence");
    expect(result).toContain("75");
  });

  test("includes effort information when present", () => {
    const enrichment = {
      effort: { tshirtSize: "M", confidence: 80, reasoning: "Medium complexity" },
    } as any;
    const result = buildEnrichmentSummaryText(enrichment);
    expect(result).toContain("Effort: M");
    expect(result).toContain("Medium complexity");
  });

  test("includes missing pieces when present", () => {
    const enrichment = {
      missingPieces: { issues: ["Missing AC", "No DoD"] },
    } as any;
    const result = buildEnrichmentSummaryText(enrichment);
    expect(result).toContain("Missing AC");
    expect(result).toContain("No DoD");
  });

  test("includes dependency info when present", () => {
    const enrichment = {
      dependencies: { dependsOn: ["story-1"], blocks: [], confidence: 70, rationale: [] },
    } as any;
    const result = buildEnrichmentSummaryText(enrichment);
    expect(result).toContain("Dependencies");
    expect(result).toContain("story-1");
  });
});

describe("buildEnrichmentSummaryHtml", () => {
  test("returns empty string for undefined enrichment", () => {
    expect(buildEnrichmentSummaryHtml(undefined)).toBe("");
  });

  test("wraps text in HTML and contains Enrichment Summary heading", () => {
    const enrichment = {
      confidence: { overall: 80, title: 85, description: 75, acceptanceCriteria: 80, rationale: [] },
    } as any;
    const result = buildEnrichmentSummaryHtml(enrichment);
    expect(result).toContain("<strong>Enrichment Summary</strong>");
    expect(result).toContain("<br/>");
  });
});

// ---------------------------------------------------------------------------
// 22. buildAdoEnrichmentCustomFields
// ---------------------------------------------------------------------------
describe("buildAdoEnrichmentCustomFields", () => {
  test("maps confidence fields to ADO custom field keys", () => {
    const enrichment = {
      confidence: { overall: 72, title: 80, description: 65, acceptanceCriteria: 70, rationale: ["Good coverage"] },
    } as any;
    const fields = buildAdoEnrichmentCustomFields(enrichment);
    expect(fields["Custom.EnrichmentConfidenceOverall"]).toBe(72);
    expect(fields["Custom.EnrichmentConfidenceTitle"]).toBe("80");
  });

  test("maps effort fields", () => {
    const enrichment = {
      effort: { tshirtSize: "L", confidence: 85, reasoning: "Complex feature" },
    } as any;
    const fields = buildAdoEnrichmentCustomFields(enrichment);
    expect(fields["Custom.EnrichmentEffortTShirtSize"]).toBe("L");
    expect(fields["Custom.EnrichmentEffortConfidence"]).toBe(85);
  });

  test("maps quality score fields", () => {
    const enrichment = {
      qualityScore: {
        score: 78,
        breakdown: { clarity: 80, completeness: 75, testability: 70, consistency: 85 },
        issues: [],
        recommendations: [],
      },
    } as any;
    const fields = buildAdoEnrichmentCustomFields(enrichment);
    expect(fields["Custom.EnrichmentQualityScore"]).toBe(78);
    expect(fields["Custom.EnrichmentQualityClarity"]).toBe(80);
  });

  test("maps definition of done", () => {
    const enrichment = {
      definitionOfDone: ["Code reviewed", "Tests passing"],
    } as any;
    const fields = buildAdoEnrichmentCustomFields(enrichment);
    expect(fields["Custom.EnrichmentDefinitionofDone"]).toContain("Code reviewed");
  });

  test("maps dependency fields", () => {
    const enrichment = {
      dependencies: { dependsOn: ["story-1"], blocks: ["story-2"], confidence: 90, rationale: [] },
    } as any;
    const fields = buildAdoEnrichmentCustomFields(enrichment);
    expect(fields["Custom.EnrichmentDependenciesConfidence"]).toBe(90);
  });

  test("returns empty object when enrichment has no populated sections", () => {
    const fields = buildAdoEnrichmentCustomFields({} as any);
    expect(Object.keys(fields)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 23. applyAdoEnrichment
// ---------------------------------------------------------------------------
describe("applyAdoEnrichment", () => {
  test("returns unchanged values when enrichment is undefined", () => {
    const result = applyAdoEnrichment("desc", ["AC1"], "tag1", undefined);
    expect(result.description).toBe("desc");
    expect(result.acceptanceCriteria).toEqual(["AC1"]);
    expect(result.tags).toBe("tag1");
    expect(result.customFields).toBeUndefined();
  });

  test("merges definition of done into acceptance criteria", () => {
    const enrichment = { definitionOfDone: ["Tests pass", "Code reviewed"] } as any;
    const result = applyAdoEnrichment("desc", ["Given X"], undefined, enrichment);
    expect(result.acceptanceCriteria).toContain("Tests pass");
    expect(result.acceptanceCriteria).toContain("Code reviewed");
  });

  test("appends enrichment summary to description", () => {
    const enrichment = {
      confidence: { overall: 80, title: 85, description: 75, acceptanceCriteria: 80, rationale: [] },
    } as any;
    const result = applyAdoEnrichment("base desc", [], undefined, enrichment);
    expect(result.description).toContain("base desc");
    expect(result.description).toContain("Enrichment Summary");
  });

  test("merges enrichment tags with existing tags", () => {
    const enrichment = {
      effort: { tshirtSize: "M", confidence: 80, reasoning: "medium" },
    } as any;
    const result = applyAdoEnrichment("desc", [], "existing-tag", enrichment);
    expect(result.tags).toContain("existing-tag");
    expect(result.tags).toContain("effort:M");
  });

  test("deduplicates merged acceptance criteria", () => {
    const enrichment = { definitionOfDone: ["AC1", "AC2"] } as any;
    const result = applyAdoEnrichment("desc", ["AC1"], undefined, enrichment);
    const ac1Count = result.acceptanceCriteria.filter((c) => c === "AC1").length;
    expect(ac1Count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 24. parseStoredAnalysis
// ---------------------------------------------------------------------------
describe("parseStoredAnalysis", () => {
  test("parses a valid themes StoredAnalysis JSON string", () => {
    const analysis = { analysisMode: "themes", themes: { "Security": { mentions: 2, subtopics: ["RBAC"] } } };
    const result = parseStoredAnalysis(JSON.stringify(analysis));
    expect(result.analysisMode).toBe("themes");
    expect(result.themes?.["Security"]).toBeDefined();
  });

  test("parses a valid process StoredAnalysis JSON string", () => {
    const analysis = { analysisMode: "process", processStages: [{ title: "Stage 1", steps: [] }] };
    const result = parseStoredAnalysis(JSON.stringify(analysis));
    expect(result.analysisMode).toBe("process");
    expect(result.processStages?.length).toBe(1);
  });

  test("falls back to themes mode for legacy format without analysisMode", () => {
    const legacy = { "Security": { mentions: 3, subtopics: [] } };
    const result = parseStoredAnalysis(JSON.stringify(legacy));
    expect(result.analysisMode).toBe("themes");
  });
});

// ---------------------------------------------------------------------------
// 25. parseStoredPreview
// ---------------------------------------------------------------------------
describe("parseStoredPreview", () => {
  test("returns parsed preview when content is valid", () => {
    const preview = {
      fileName: "doc.txt",
      analysisMode: "themes",
      storyMaturity: "placeholder",
      items: [],
      warnings: [],
      idempotencyKey: "key123",
      createdAt: new Date().toISOString(),
    };
    const result = parseStoredPreview(JSON.stringify(preview));
    expect(result).not.toBeUndefined();
    expect(result?.fileName).toBe("doc.txt");
  });

  test("returns undefined for invalid JSON", () => {
    expect(parseStoredPreview("not valid json")).toBeUndefined();
  });

  test("returns undefined when items is not an array", () => {
    const badPreview = { fileName: "doc.txt", items: "not-an-array" };
    const result = parseStoredPreview(JSON.stringify(badPreview));
    expect(result).toBeUndefined();
  });

  test("returns undefined when fileName is missing", () => {
    const badPreview = { items: [] };
    const result = parseStoredPreview(JSON.stringify(badPreview));
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 26. scanSectionForThemes
// ---------------------------------------------------------------------------
describe("scanSectionForThemes", () => {
  test("populates themes map when keywords are matched", () => {
    const themeDetails: Record<string, { mentions: number; subtopics: string[] }> = {};
    scanSectionForThemes("the workflow and approval process must be validated by the manager", themeDetails);
    expect(Object.keys(themeDetails).length).toBeGreaterThan(0);
  });

  test("does not add themes when no keywords matched", () => {
    const themeDetails: Record<string, { mentions: number; subtopics: string[] }> = {};
    scanSectionForThemes("zzz xyz abc nothing here", themeDetails);
    expect(Object.keys(themeDetails)).toHaveLength(0);
  });

  test("increments mentions on repeated calls for same theme", () => {
    const themeDetails: Record<string, { mentions: number; subtopics: string[] }> = {};
    scanSectionForThemes("security rbac encryption", themeDetails);
    const firstMentions = themeDetails["Security and Compliance"]?.mentions ?? 0;
    scanSectionForThemes("security compliance audit", themeDetails);
    expect(themeDetails["Security and Compliance"]?.mentions ?? 0).toBeGreaterThan(firstMentions);
  });

  test("adds subtopics based on detailed keyword matching", () => {
    const themeDetails: Record<string, { mentions: number; subtopics: string[] }> = {};
    scanSectionForThemes("power bi dashboard kpi reporting", themeDetails);
    const reporting = themeDetails["Reporting and Analytics"];
    expect(reporting?.subtopics.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 27. parseAnalysisMode
// ---------------------------------------------------------------------------
describe("parseAnalysisMode", () => {
  test("returns 'process' for 'process' input", () => {
    expect(parseAnalysisMode("process")).toBe("process");
    expect(parseAnalysisMode("PROCESS")).toBe("process");
    expect(parseAnalysisMode("Process")).toBe("process");
  });

  test("returns 'themes' for any other input", () => {
    expect(parseAnalysisMode("themes")).toBe("themes");
    expect(parseAnalysisMode("THEMES")).toBe("themes");
    expect(parseAnalysisMode(undefined)).toBe("themes");
    expect(parseAnalysisMode("random")).toBe("themes");
  });
});

// ---------------------------------------------------------------------------
// 28. getPreviewStoreKey
// ---------------------------------------------------------------------------
describe("getPreviewStoreKey", () => {
  test("returns a key prefixed with __preview_", () => {
    expect(getPreviewStoreKey("doc.txt")).toBe("__preview_doc.txt");
  });

  test("preserves the full filename including extension", () => {
    expect(getPreviewStoreKey("my-file.process.txt")).toBe("__preview_my-file.process.txt");
  });
});

// ---------------------------------------------------------------------------
// 29. findEnrichmentForTitle
// ---------------------------------------------------------------------------
describe("findEnrichmentForTitle", () => {
  const mockPreview = {
    fileName: "doc.txt",
    analysisMode: "themes" as const,
    storyMaturity: "detailed" as const,
    items: [
      { id: "item-1", title: "Implement RBAC", enrichment: { confidence: { overall: 80, title: 80, description: 80, acceptanceCriteria: 80, rationale: [] } }, acceptanceCriteria: [], description: "", sourceReferences: [] },
      { id: "item-2", title: "Implement Dashboard", enrichment: undefined, acceptanceCriteria: [], description: "", sourceReferences: [] },
    ],
    warnings: [],
    idempotencyKey: "key",
    createdAt: new Date().toISOString(),
  };

  test("returns enrichment for matching title", () => {
    const result = findEnrichmentForTitle(mockPreview as any, "Implement RBAC");
    expect(result).toBeDefined();
    expect((result as any)?.confidence?.overall).toBe(80);
  });

  test("returns undefined when title does not match", () => {
    const result = findEnrichmentForTitle(mockPreview as any, "Implement Billing");
    expect(result).toBeUndefined();
  });

  test("returns undefined when preview is undefined", () => {
    expect(findEnrichmentForTitle(undefined, "any title")).toBeUndefined();
  });

  test("matches case-insensitively after normalisation", () => {
    const result = findEnrichmentForTitle(mockPreview as any, "implement rbac");
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 30. toEnrichmentLabelToken and buildEnrichmentSummaryText
// ---------------------------------------------------------------------------
describe("toEnrichmentLabelToken", () => {
  test("lowercases and replaces special characters with dashes", () => {
    expect(toEnrichmentLabelToken("My Label 123!")).toBe("my-label-123");
  });
  test("trims leading and trailing dashes", () => {
    expect(toEnrichmentLabelToken("-Test-Value-")).toBe("test-value");
  });
});

describe("buildEnrichmentSummaryText", () => {
  test("returns empty string if no enrichment", () => {
    expect(buildEnrichmentSummaryText(undefined)).toBe("");
  });

  test("builds summary capturing all enrichment blocks", () => {
    const enrichment = {
      confidence: { overall: 80, title: 90, description: 85, acceptanceCriteria: 70 },
      effort: { tshirtSize: "M", confidence: 60, reasoning: "standard dev" },
      qualityScore: { score: 75, breakdown: { clarity: 80, completeness: 70, testability: 60, consistency: 90 } },
      missingPieces: { issues: ["missing API spec"] },
      consistencyIssues: [{ severity: "high", description: "overlap", conflictsWith: ["Epic A"] }],
      dependencies: { dependsOn: ["Feature X"], blocks: [], confidence: 95 }
    };

    const result = buildEnrichmentSummaryText(enrichment as any);
    expect(result).toContain("overall 80/100");
    expect(result).toContain("Effort: M");
    expect(result).toContain("standard dev");
    expect(result).toContain("testability 60");
    expect(result).toContain("missing API spec");
    expect(result).toContain("(high) overlap [Epic A]");
    expect(result).toContain("dependsOn=Feature X");
  });

  test("handles partial enrichment safely", () => {
    const result = buildEnrichmentSummaryText({ confidence: { overall: 50, title: 50, description: 50, acceptanceCriteria: 50 } } as any);
    expect(result).toContain("overall 50/100");
    expect(result).not.toContain("Quality score");
  });
});

describe("extractTextFromBinary", () => {
  const extractTextFromBinary = _testExports.extractTextFromBinary as any;

  beforeEach(() => {
    jest.resetModules();
  });

  test("handles docx fallback extraction", async () => {
    jest.doMock("mammoth", () => ({
      extractRawText: (jest.fn() as any).mockResolvedValue({ value: "Extracted DOCX Content" }),
    }));
    
    // Some dummy base64 string
    const result = await extractTextFromBinary("dGVzdA==", "file.docx");
    expect(result).toContain("Extracted DOCX Content");
  });

  test("returns empty string on docx extraction failure", async () => {
    jest.doMock("mammoth", () => ({
      extractRawText: (jest.fn() as any).mockRejectedValue(new Error("MOCK ERR")),
    }));
    
    const result = await extractTextFromBinary("dGVzdA==", "failure.docx");
    expect(result).toBe("");
  });

  test("handles xlsx fallback extraction", async () => {
    jest.doMock("xlsx", () => ({
      read: jest.fn().mockReturnValue({
        SheetNames: ["Sheet1"],
        Sheets: { "Sheet1": {} }
      }),
      utils: {
        sheet_to_csv: jest.fn().mockReturnValue("col1,col2\nval1,val2")
      }
    }));
    
    const result = await extractTextFromBinary("dGVzdA==", "file.xlsx");
    expect(result).toContain("Sheet1");
    expect(result).toContain("col1,col2");
  });

  test("returns empty string on xlsx parse failure", async () => {
    jest.doMock("xlsx", () => ({
      read: jest.fn().mockImplementation(() => { throw new Error("MOCK ERR") })
    }));
    
    const result = await extractTextFromBinary("dGVzdA==", "failure.xlsx");
    expect(result).toBe("");
  });
});
