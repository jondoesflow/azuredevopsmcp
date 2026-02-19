import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import { getFileStore, handleWorkItemTool } from "./workItems.js";
import type { JiraClient } from "../jiraClient.js";

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

  test("list_features routes to Jira when targetSystem=jira and uses New Feature issue type", async () => {
    const listIssuesMock: any = jest.fn();
    listIssuesMock.mockResolvedValue([
      { id: "100", key: "ABC-10", fields: { summary: "Feature 1", status: { name: "To Do" } } },
    ]);

    const jiraClient = { listIssues: listIssuesMock } as unknown as JiraClient;

    const raw = await handleWorkItemTool({ jiraClient }, "list_features", {
      project: "ABC",
      targetSystem: "jira",
      epicKey: "ABC-1",
      top: 10,
    });

    expect((jiraClient.listIssues as unknown as jest.Mock).mock.calls[0][0]).toMatchObject({
      projectKey: "ABC",
      issueType: "New Feature",
      epicKey: "ABC-1",
      maxResults: 10,
    });

    const parsed = JSON.parse(raw) as { result: string; count: number; items: Array<{ key: string }> };
    expect(parsed.result).toBe("success");
    expect(parsed.count).toBe(1);
    expect(parsed.items[0].key).toBe("ABC-10");
  });

  test("create_user_story (Jira) links story to featureKey when provided", async () => {
    const createIssueMock: any = jest.fn();
    createIssueMock.mockResolvedValue({ id: "200", key: "ABC-20" });

    const createIssueLinkMock: any = jest.fn();
    createIssueLinkMock.mockResolvedValue(undefined);

    const jiraClient = {
      createIssue: createIssueMock,
      createIssueLink: createIssueLinkMock,
    } as unknown as JiraClient;

    const raw = await handleWorkItemTool({ jiraClient }, "create_user_story", {
      project: "ABC",
      targetSystem: "jira",
      title: "Story 1",
      featureKey: "ABC-10",
      acceptanceCriteria: ["Given X when Y then Z"],
    });

    expect((jiraClient.createIssue as unknown as jest.Mock).mock.calls[0][0]).toMatchObject({
      projectKey: "ABC",
      issueType: "Story",
      summary: "Story 1",
    });

    expect((jiraClient.createIssueLink as unknown as jest.Mock).mock.calls[0][0]).toEqual({
      parentKey: "ABC-10",
      childKey: "ABC-20",
    });

    const parsed = JSON.parse(raw) as { result: string; key?: string; id?: string };
    expect(parsed.result).toBe("success");
  });
});
