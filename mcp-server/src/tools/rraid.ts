/**
 * RRAID Extraction Engine — extracts Risks, Requirements, Assumptions,
 * Issues, and Dependencies from document content using pattern-based analysis.
 */

export type RRAIDCategory = "Risk" | "Requirement" | "Assumption" | "Issue" | "Dependency";
export type Severity = "Low" | "Medium" | "High";

export interface RRAIDItem {
  id: string;
  category: RRAIDCategory;
  title: string;
  description: string;
  severity: Severity;
  sourceFile: string;
  sourceExcerpt: string;
  relatedStoryTitles: string[];
}

const RISK_PATTERNS = [
  /\b(?:risk|risks)\b.*?[.!]/gi,
  /\b(?:might fail|could impact|could cause|may result in|threat|vulnerability)\b.*?[.!]/gi,
  /\bif\s+.{10,60}?\bthen\b.*?[.!]/gi,
  /\b(?:concern about|worried about|danger of)\b.*?[.!]/gi,
];

const REQUIREMENT_PATTERNS = [
  /\b(?:must|shall|requirement|mandatory|compliance|regulation)\b.*?[.!]/gi,
  /\b(?:required to|need to ensure|obligated)\b.*?[.!]/gi,
  /\b(?:legal|regulatory|audit|governance)\b.*?(?:require|need|demand).*?[.!]/gi,
];

const ASSUMPTION_PATTERNS = [
  /\b(?:assum(?:e|ing|ption)|expect(?:ation|ing|ed)|prerequisite|presume)\b.*?[.!]/gi,
  /\b(?:we believe|it is expected|taken for granted)\b.*?[.!]/gi,
];

const ISSUE_PATTERNS = [
  /\b(?:issue|problem|blocker|impediment|obstacle|limitation|constraint)\b.*?[.!]/gi,
  /\b(?:currently broken|not working|defect|bug|gap)\b.*?[.!]/gi,
];

const DEPENDENCY_PATTERNS = [
  /\b(?:depends on|dependent on|requires|relies on|contingent)\b.*?[.!]/gi,
  /\b(?:external|third-party|vendor|partner)\b.*?(?:provide|deliver|supply).*?[.!]/gi,
  /\b(?:blocked by|waiting for|pending)\b.*?[.!]/gi,
];

function extractByPatterns(content: string, patterns: RegExp[]): string[] {
  const matches = new Set<string>();
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const text = match[0].trim();
      if (text.length >= 15 && text.length <= 500) {
        matches.add(text);
      }
    }
  }
  return Array.from(matches);
}

function classifySeverity(text: string): Severity {
  const lower = text.toLowerCase();
  if (/\b(?:critical|severe|major|high|significant|catastrophic|showstopper)\b/.test(lower)) return "High";
  if (/\b(?:moderate|medium|notable|important)\b/.test(lower)) return "Medium";
  return "Low";
}

function generateId(): string {
  return `rraid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildItems(matches: string[], category: RRAIDCategory, sourceFile: string): RRAIDItem[] {
  return matches.map((text) => ({
    id: generateId(),
    category,
    title: text.length > 120 ? text.slice(0, 117) + "..." : text,
    description: text,
    severity: classifySeverity(text),
    sourceFile,
    sourceExcerpt: text.slice(0, 200),
    relatedStoryTitles: [],
  }));
}

export function extractRRAID(content: string, sourceFile: string): RRAIDItem[] {
  const items: RRAIDItem[] = [
    ...buildItems(extractByPatterns(content, RISK_PATTERNS), "Risk", sourceFile),
    ...buildItems(extractByPatterns(content, REQUIREMENT_PATTERNS), "Requirement", sourceFile),
    ...buildItems(extractByPatterns(content, ASSUMPTION_PATTERNS), "Assumption", sourceFile),
    ...buildItems(extractByPatterns(content, ISSUE_PATTERNS), "Issue", sourceFile),
    ...buildItems(extractByPatterns(content, DEPENDENCY_PATTERNS), "Dependency", sourceFile),
  ];

  // Deduplicate by normalized title
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function matchRRAIDToStories(items: RRAIDItem[], storyTitles: string[]): void {
  for (const item of items) {
    const words = item.title.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    for (const storyTitle of storyTitles) {
      const storyLower = storyTitle.toLowerCase();
      const matchCount = words.filter((w) => storyLower.includes(w)).length;
      if (matchCount >= 2) {
        item.relatedStoryTitles.push(storyTitle);
      }
    }
  }
}
