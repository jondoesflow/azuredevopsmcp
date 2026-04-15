import { describe, expect, test } from "@jest/globals";

import { extractRRAID, matchRRAIDToStories, type RRAIDItem } from "./rraid.js";

describe("rraid", () => {
  test("extractRRAID classifies multiple categories", () => {
    const content = [
      "There is risk with high impact that delayed permits could impact delivery.",
      "The system must retain audit logs for seven years.",
      "We assume network coverage is available at all field locations.",
      "Current issue: integration endpoint is not working in staging.",
      "Release depends on vendor approval for API access.",
    ].join(" ");

    const items = extractRRAID(content, "sample.txt");
    const categories = new Set(items.map((i) => i.category));

    expect(categories.has("Risk")).toBe(true);
    expect(categories.has("Requirement")).toBe(true);
    expect(categories.has("Assumption")).toBe(true);
    expect(categories.has("Issue")).toBe(true);
    expect(categories.has("Dependency")).toBe(true);
    expect(items.some((i) => i.severity === "High")).toBe(true);
  });

  test("extractRRAID deduplicates repeated signals", () => {
    const sentence = "The system must support audit compliance for all changes.";
    const items = extractRRAID(`${sentence} ${sentence}`, "dup.txt");

    const normalized = items.map((i) => i.title.toLowerCase().replace(/[^a-z0-9]/g, ""));
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  test("matchRRAIDToStories links items to related story titles", () => {
    const items: RRAIDItem[] = [
      {
        id: "r1",
        category: "Dependency",
        title: "Vendor approval for payment integration API",
        description: "Vendor approval for payment integration API",
        severity: "Medium",
        sourceFile: "x.txt",
        sourceExcerpt: "Vendor approval...",
        relatedStoryTitles: [],
      },
    ];

    matchRRAIDToStories(items, [
      "Implement payment integration API with vendor onboarding",
      "Improve dashboard colors",
    ]);

    expect(items[0].relatedStoryTitles).toContain("Implement payment integration API with vendor onboarding");
    expect(items[0].relatedStoryTitles).toHaveLength(1);
  });
});
