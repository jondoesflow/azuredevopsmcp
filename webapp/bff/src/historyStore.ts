import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_PATH = path.join(__dirname, "..", ".history.json");
const MAX_ENTRIES_PER_USER = 200;

export interface HistoryEntry {
  id: string;
  userId: string;
  timestamp: string;
  action: "upload" | "analyse_document" | "preview_backlog" | "create_backlog" | "create_personas";
  inputs: {
    fileName?: string;
    fileNames?: string[];
    documentType?: string;
    analysisMode?: string;
    project?: string;
  };
  outputs: {
    success: boolean;
    summary: string;
    boardUrl?: string;
    itemCount?: number;
    skippedCount?: number;
    personaCount?: number;
  };
}

interface HistoryData {
  entries: HistoryEntry[];
}

function loadHistory(): HistoryData {
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      const raw = fs.readFileSync(HISTORY_PATH, "utf-8");
      return JSON.parse(raw) as HistoryData;
    }
  } catch {
    // Corrupted file — start fresh
  }
  return { entries: [] };
}

function saveHistory(data: HistoryData): void {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function addHistoryEntry(
  userId: string,
  action: HistoryEntry["action"],
  inputs: HistoryEntry["inputs"],
  outputs: HistoryEntry["outputs"],
): HistoryEntry {
  const data = loadHistory();
  const entry: HistoryEntry = {
    id: randomUUID(),
    userId,
    timestamp: new Date().toISOString(),
    action,
    inputs,
    outputs,
  };

  data.entries.push(entry);

  // Enforce per-user cap
  const userEntries = data.entries.filter((e) => e.userId === userId);
  if (userEntries.length > MAX_ENTRIES_PER_USER) {
    const cutoff = userEntries.length - MAX_ENTRIES_PER_USER;
    const idsToRemove = new Set(userEntries.slice(0, cutoff).map((e) => e.id));
    data.entries = data.entries.filter((e) => !idsToRemove.has(e.id));
  }

  saveHistory(data);
  return entry;
}

export function getHistoryForUser(userId: string): HistoryEntry[] {
  const data = loadHistory();
  return data.entries
    .filter((e) => e.userId === userId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function clearHistoryForUser(userId: string): number {
  const data = loadHistory();
  const before = data.entries.length;
  data.entries = data.entries.filter((e) => e.userId !== userId);
  saveHistory(data);
  return before - data.entries.length;
}
