import { beforeEach, describe, expect, test } from "@jest/globals";

import { getFileStore, handleWorkItemTool } from "./workItems.js";

describe("workItems tools", () => {
  beforeEach(() => {
    getFileStore().clear();
  });

  test("process_transcript stores file and does not return preview by default", async () => {
    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "Test",
      fileName: "t1.txt",
      fileContent: "hello world",
    });

    const parsed = JSON.parse(raw) as { result: string; fileName: string; size: number; preview?: string };
    expect(parsed.result).toBe("success");
    expect(parsed.fileName).toBe("t1.txt");
    expect(parsed.preview).toBeUndefined();

    const stored = getFileStore().get("t1.txt");
    expect(stored?.content).toBe("hello world");
  });

  test("process_transcript returns preview only when includePreview=true", async () => {
    const raw = await handleWorkItemTool({}, "process_transcript", {
      project: "Test",
      fileName: "t2.txt",
      fileContent: "hello world",
      includePreview: true,
    });

    const parsed = JSON.parse(raw) as { result: string; preview?: string };
    expect(parsed.result).toBe("success");
    expect(typeof parsed.preview).toBe("string");
    expect(parsed.preview).toContain("hello");
  });

  test("get_file_content returns metadata only by default", async () => {
    await handleWorkItemTool({}, "process_transcript", {
      project: "Test",
      fileName: "t3.txt",
      fileContent: "secret transcript",
    });

    const raw = await handleWorkItemTool({}, "get_file_content", {
      project: "Test",
      fileName: "t3.txt",
    });

    const parsed = JSON.parse(raw) as { result: string; content?: string; message?: string };
    expect(parsed.result).toBe("success");
    expect(parsed.content).toBeUndefined();
    expect(parsed.message).toMatch(/suppressed/i);
  });

  test("get_file_content returns content only when includeContent=true", async () => {
    await handleWorkItemTool({}, "process_transcript", {
      project: "Test",
      fileName: "t4.txt",
      fileContent: "secret transcript",
    });

    const raw = await handleWorkItemTool({}, "get_file_content", {
      project: "Test",
      fileName: "t4.txt",
      includeContent: true,
    });

    const parsed = JSON.parse(raw) as { result: string; content?: string };
    expect(parsed.result).toBe("success");
    expect(parsed.content).toBe("secret transcript");
  });

  test("analyse_document returns rubric summary and stores rubrics in cached analysis", async () => {
    await handleWorkItemTool({}, "process_transcript", {
      project: "Test",
      fileName: "t5.txt",
      fileContent: "We need security RBAC and an integration API plus audit trail.",
    });

    const raw = await handleWorkItemTool({}, "analyse_document", {
      project: "Test",
      fileName: "t5.txt",
      analysisMode: "themes",
    });

    const parsed = JSON.parse(raw) as { result: string; rubricsFound?: number; rubrics?: unknown[] };
    expect(parsed.result).toBe("success");
    expect(typeof parsed.rubricsFound).toBe("number");
    expect(Array.isArray(parsed.rubrics)).toBe(true);

    const cached = getFileStore().get("__analysis_t5.txt");
    expect(cached).toBeDefined();

    const cachedJson = JSON.parse(cached!.content) as { rubrics?: unknown[]; analysisMode: string };
    expect(cachedJson.analysisMode).toBe("themes");
    expect(Array.isArray(cachedJson.rubrics)).toBe(true);
    expect((cachedJson.rubrics ?? []).length).toBeGreaterThan(0);
  });
});
