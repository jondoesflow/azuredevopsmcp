import { describe, expect, test } from "@jest/globals";

import {
  generateRefinementSuggestion,
  refineAcceptanceCriteria,
  refineDescription,
  refineTitle,
} from "./refinement.js";

describe("refinement", () => {
  test("refineTitle adds action verb and strips vague terms", () => {
    const refined = refineTitle("the easy customer sync", []);

    expect(refined.toLowerCase()).toContain("implement");
    expect(refined.toLowerCase()).not.toContain("easy");
  });

  test("refineDescription injects user story frame and NFR guidance", () => {
    const refined = refineDescription(
      "Sync customer profile records from upstream service for internal users during onboarding.",
      ["missing error handling"]
    );

    expect(refined).toMatch(/^As a user/);
    expect(refined).toContain("Error handling considerations");
    expect(refined).toContain("Non-functional requirements");
  });

  test("refineAcceptanceCriteria converts to gherkin and adds edge/negative cases", () => {
    const refined = refineAcceptanceCriteria(["user updates customer details"], []);

    expect(refined[0].toLowerCase()).toMatch(/^given/);
    expect(refined.some((c) => /edge-case input/i.test(c))).toBe(true);
    expect(refined.some((c) => /unauthorized user/i.test(c))).toBe(true);
  });

  test("generateRefinementSuggestion reports changes and confidence uplift", () => {
    const suggestion = generateRefinementSuggestion(
      42,
      "easy profile page",
      "show profile",
      ["display info"],
      40,
      ["error handling missing"]
    );

    expect(suggestion.workItemId).toBe(42);
    expect(suggestion.improvements.length).toBeGreaterThan(0);
    expect(suggestion.estimatedConfidenceAfter).toBeGreaterThan(40);
    expect(suggestion.suggestedTitle).toBeDefined();
    expect(suggestion.suggestedAcceptanceCriteria?.length).toBeGreaterThan(1);
  });
});
