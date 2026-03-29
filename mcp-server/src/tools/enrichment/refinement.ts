/**
 * Story Refinement Engine — generates improved titles, descriptions,
 * and acceptance criteria for low-quality user stories.
 */

const VAGUE_TERMS = ["fast", "easy", "seamless", "intuitive", "robust", "scalable", "efficient", "good", "nice", "better", "simple", "various", "etc", "appropriate", "adequate", "proper", "relevant"];

const ACTION_VERBS = ["Implement", "Create", "Configure", "Enable", "Integrate", "Develop", "Build", "Add", "Establish", "Define"];

export function refineTitle(title: string, issues: string[]): string {
  if (!title || title.length < 5) return title;
  let refined = title.trim();

  // Ensure starts with action verb
  const startsWithVerb = ACTION_VERBS.some((v) => refined.toLowerCase().startsWith(v.toLowerCase()));
  if (!startsWithVerb) {
    // Remove common weak prefixes
    refined = refined.replace(/^(the|a|an|some|do|make|handle)\s+/i, "");
    refined = `Implement ${refined.charAt(0).toLowerCase()}${refined.slice(1)}`;
  }

  // Remove vague terms
  for (const term of VAGUE_TERMS) {
    refined = refined.replace(new RegExp(`\\b${term}\\b`, "gi"), "").replace(/\s{2,}/g, " ").trim();
  }

  // Ensure reasonable length
  if (refined.length < 15 && title.length >= 15) return title;
  return refined || title;
}

export function refineDescription(description: string, issues: string[]): string {
  if (!description) {
    return "As a [user role], I need [capability/feature] so that [business value/outcome].";
  }

  let refined = description.trim();

  // Add user story format if missing
  const hasAsA = /as an?\s/i.test(refined);
  if (!hasAsA) {
    refined = `As a user, I need the following capability:\n\n${refined}`;
  }

  // Add error handling mention if missing
  const hasErrorHandling = /error|exception|fail|invalid|validation/i.test(refined);
  if (!hasErrorHandling && issues.some((i) => /error|exception|handling/i.test(i))) {
    refined += "\n\nError handling considerations should be addressed, including validation of inputs and graceful failure scenarios.";
  }

  // Add NFR mention if missing
  const hasNfr = /performance|security|accessibility|logging|monitoring/i.test(refined);
  if (!hasNfr && refined.length > 50) {
    refined += "\n\nNon-functional requirements: Consider performance, security, and accessibility implications.";
  }

  return refined;
}

export function refineAcceptanceCriteria(criteria: string[], issues: string[]): string[] {
  const refined = [...criteria];

  // Ensure Given/When/Then format
  const hasGherkin = refined.some((c) => /^(given|when|then)\b/i.test(c.trim()));
  if (!hasGherkin && refined.length > 0) {
    // Convert existing criteria to Gherkin format
    const converted = refined.map((c) => {
      const stripped = c.replace(/^[-•*]\s*/, "").trim();
      if (/^(given|when|then)\b/i.test(stripped)) return stripped;
      return `Given the feature is active, When ${stripped.charAt(0).toLowerCase()}${stripped.slice(1)}, Then the expected outcome is achieved`;
    });
    refined.length = 0;
    refined.push(...converted);
  }

  // Add edge case criteria if missing
  const hasEdgeCases = refined.some((c) => /edge|boundary|invalid|empty|null|error/i.test(c));
  if (!hasEdgeCases) {
    refined.push("Given invalid or edge-case input, When the feature processes the input, Then appropriate error messages are displayed and no data corruption occurs");
  }

  // Add negative test case if missing
  const hasNegative = refined.some((c) => /unauthorized|forbidden|denied|without permission/i.test(c));
  if (!hasNegative && refined.length < 6) {
    refined.push("Given an unauthorized user, When they attempt to access the feature, Then access is denied with an appropriate message");
  }

  return refined;
}

export interface RefinementSuggestion {
  workItemId: number;
  currentTitle: string;
  currentDescription: string;
  currentAcceptanceCriteria: string[];
  suggestedTitle?: string;
  suggestedDescription?: string;
  suggestedAcceptanceCriteria?: string[];
  confidenceBefore: number;
  estimatedConfidenceAfter: number;
  improvements: string[];
}

export function generateRefinementSuggestion(
  workItemId: number,
  title: string,
  description: string,
  acceptanceCriteria: string[],
  confidenceOverall: number,
  missingIssues: string[]
): RefinementSuggestion {
  const improvements: string[] = [];

  const suggestedTitle = refineTitle(title, missingIssues);
  if (suggestedTitle !== title) improvements.push("Improved title with action verb and removed vague terms");

  const suggestedDescription = refineDescription(description, missingIssues);
  if (suggestedDescription !== description) improvements.push("Enhanced description with user story format, error handling, and NFR considerations");

  const suggestedAC = refineAcceptanceCriteria(acceptanceCriteria, missingIssues);
  if (JSON.stringify(suggestedAC) !== JSON.stringify(acceptanceCriteria)) improvements.push("Added Gherkin format, edge cases, and security criteria");

  // Estimate improved confidence
  let boost = 0;
  if (suggestedTitle !== title) boost += 10;
  if (suggestedDescription !== description) boost += 15;
  if (JSON.stringify(suggestedAC) !== JSON.stringify(acceptanceCriteria)) boost += 10;
  const estimatedConfidenceAfter = Math.min(100, confidenceOverall + boost);

  return {
    workItemId,
    currentTitle: title,
    currentDescription: description,
    currentAcceptanceCriteria: acceptanceCriteria,
    suggestedTitle: suggestedTitle !== title ? suggestedTitle : undefined,
    suggestedDescription: suggestedDescription !== description ? suggestedDescription : undefined,
    suggestedAcceptanceCriteria: JSON.stringify(suggestedAC) !== JSON.stringify(acceptanceCriteria) ? suggestedAC : undefined,
    confidenceBefore: confidenceOverall,
    estimatedConfidenceAfter,
    improvements,
  };
}
