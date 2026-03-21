import { ChatIntent, ChatRequestBody } from "../types.js";

function includesAny(raw: string, keywords: string[]): boolean {
  return keywords.some((keyword) => raw.includes(keyword));
}

export function parseChatIntent(input: ChatRequestBody): ChatIntent {
  const message = input.message.trim();
  const lowered = message.toLowerCase();

  if (includesAny(lowered, ["list files", "show files", "uploaded files"])) {
    return { type: "listFiles" };
  }

  if (includesAny(lowered, ["analyse", "analyze"])) {
    return {
      type: "analyseDocument",
      fileName: input.fileName,
      analysisMode: input.analysisMode,
    };
  }

  if (includesAny(lowered, ["create backlog", "build backlog"])) {
    const project = input.project?.trim();
    if (!project) {
      return { type: "help" };
    }

    return {
      type: "createBacklog",
      project,
      fileName: input.fileName,
      analysisMode: input.analysisMode,
    };
  }

  if (includesAny(lowered, ["delete file", "remove file"])) {
    return {
      type: "deleteFile",
      fileName: input.fileName,
    };
  }

  return { type: "help" };
}

export function buildHelpMessage(): string {
  return [
    "I can help with these actions:",
    "- 'list files' to view uploaded files",
    "- 'analyse document' to run analyse_document",
    "- 'create backlog' with a project to run analyse_document + create_backlog",
    "- 'delete file' to remove an uploaded file",
  ].join("\n");
}
