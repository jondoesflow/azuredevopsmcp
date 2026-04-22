// @ts-nocheck
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Operation } from "azure-devops-node-api/interfaces/common/VSSInterfaces.js";

const mockGetPersonalAccessTokenHandler = jest.fn();
const mockGetWorkItemTrackingApi = jest.fn();
const mockWebApi = jest.fn();

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock("azure-devops-node-api", () => ({
  getPersonalAccessTokenHandler: mockGetPersonalAccessTokenHandler,
  WebApi: mockWebApi,
}));

jest.mock("./logger.js", () => ({
  logger: mockLogger,
}));

import { AzureDevOpsClient } from "./azureDevOpsClient.js";

const config = {
  enrichment: {
    enabled: false,
    dependencies: false,
    definitionOfDone: false,
    confidence: false,
    missingPieces: false,
    consistency: false,
    effort: false,
    quality: false,
    aiAssist: false,
  },
  azureDevOps: {
    org: "test-org",
    pat: "test-pat",
    url: "https://dev.azure.com/test-org/",
  },
};

const buildWitApi = () => ({
  createWorkItem: jest.fn(),
  getWorkItem: jest.fn(),
  queryByWiql: jest.fn(),
  getWorkItems: jest.fn(),
  updateWorkItem: jest.fn(),
});

describe("AzureDevOpsClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPersonalAccessTokenHandler.mockReturnValue({ token: "handler" });
    mockWebApi.mockImplementation((url: string) => ({
      serverUrl: url,
      getWorkItemTrackingApi: mockGetWorkItemTrackingApi,
    }));
  });

  test("throws when Azure DevOps config is missing", () => {
    expect(() => new AzureDevOpsClient({ enrichment: config.enrichment })).toThrow(
      "Azure DevOps is not configured"
    );
  });

  test("initializes auth and exposes org URL and PAT", () => {
    const client = new AzureDevOpsClient(config);

    expect(mockGetPersonalAccessTokenHandler).toHaveBeenCalledWith("test-pat");
    expect(mockWebApi).toHaveBeenCalledWith("https://dev.azure.com/test-org/", { token: "handler" });
    expect(client.getOrgUrl()).toBe("https://dev.azure.com/test-org/");
    expect(client.getPat()).toBe("test-pat");
  });

  test("createWorkItem builds full patch payload", async () => {
    const witApi = buildWitApi();
    const created = { id: 1001 };
    witApi.createWorkItem.mockResolvedValue(created);
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);
    const workItem = await client.createWorkItem({
      project: "Proj",
      witType: "User Story",
      title: "Story title",
      description: "desc",
      iterationPath: "Proj\\Sprint 1",
      areaPath: "Proj",
      state: "New",
      assignedTo: "alice@example.com",
      parentId: 42,
      acceptanceCriteria: ["Given one", "When two"],
      priority: 2,
      tags: "foo;bar",
      moscow: "Must",
      customFields: {
        "Custom.Flag": true,
        "Custom.Score": 7,
      },
    });

    expect(workItem).toBe(created);
    expect(witApi.createWorkItem).toHaveBeenCalledTimes(1);

    const [, patchDocument] = witApi.createWorkItem.mock.calls[0];
    expect(patchDocument).toEqual(
      expect.arrayContaining([
        { op: Operation.Add, path: "/fields/System.Title", value: "Story title" },
        { op: Operation.Add, path: "/fields/System.Description", value: "desc" },
        { op: Operation.Add, path: "/fields/System.IterationPath", value: "Proj\\Sprint 1" },
        { op: Operation.Add, path: "/fields/System.AreaPath", value: "Proj" },
        { op: Operation.Add, path: "/fields/System.AssignedTo", value: "alice@example.com" },
        { op: Operation.Add, path: "/fields/System.State", value: "New" },
        {
          op: Operation.Add,
          path: "/relations/-",
          value: {
            rel: "System.LinkTypes.Hierarchy-reverse",
            url: "https://dev.azure.com/test-org/_apis/wit/workItems/42",
          },
        },
        {
          op: Operation.Add,
          path: "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
          value: "Given one<br/>When two<br/>",
        },
        { op: Operation.Add, path: "/fields/Microsoft.VSTS.Common.Priority", value: 2 },
        { op: Operation.Add, path: "/fields/System.Tags", value: "foo;bar" },
        { op: Operation.Add, path: "/fields/Custom.MoSCoW", value: "Must" },
        { op: Operation.Add, path: "/fields/Custom.Flag", value: true },
        { op: Operation.Add, path: "/fields/Custom.Score", value: 7 },
      ])
    );
  });

  test("createWorkItem sanitizes HTML content for description and acceptance criteria", async () => {
    const witApi = buildWitApi();
    witApi.createWorkItem.mockResolvedValue({ id: 1002 });
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);
    await client.createWorkItem({
      project: "Proj",
      witType: "User Story",
      title: "Story",
      description: "<script>alert('x')</script>",
      acceptanceCriteria: ["Given <b>unsafe</b> input"],
    });

    const [, patchDocument] = witApi.createWorkItem.mock.calls[0];
    expect(patchDocument).toEqual(
      expect.arrayContaining([
        {
          op: Operation.Add,
          path: "/fields/System.Description",
          value: "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;",
        },
        {
          op: Operation.Add,
          path: "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
          value: "Given &lt;b&gt;unsafe&lt;/b&gt; input<br/>",
        },
      ])
    );
  });

  test("createWorkItem retries without iteration path when tree is invalid", async () => {
    const witApi = buildWitApi();
    const iterationError = new Error("TF401347: Invalid tree name for field System.IterationPath");
    witApi.createWorkItem.mockRejectedValueOnce(iterationError).mockResolvedValueOnce({ id: 200 });
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);
    const result = await client.createWorkItem({
      project: "Proj",
      witType: "Task",
      title: "T",
      iterationPath: "Proj\\Invalid",
    });

    expect(result.id).toBe(200);
    expect(witApi.createWorkItem).toHaveBeenCalledTimes(2);

    const [, firstPatch] = witApi.createWorkItem.mock.calls[0];
    const [, fallbackPatch] = witApi.createWorkItem.mock.calls[1];
    expect((firstPatch as Array<{ path: string }>).some((op) => op.path === "/fields/System.IterationPath")).toBe(true);
    expect((fallbackPatch as Array<{ path: string }>).some((op) => op.path === "/fields/System.IterationPath")).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  test("createWorkItem rethrows non-iteration errors", async () => {
    const witApi = buildWitApi();
    const failure = new Error("permission denied");
    witApi.createWorkItem.mockRejectedValue(failure);
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);

    await expect(
      client.createWorkItem({
        project: "Proj",
        witType: "Task",
        title: "T",
      })
    ).rejects.toThrow("permission denied");
    expect(mockLogger.error).toHaveBeenCalledWith("Failed to create work item", failure);
  });

  test("getWorkItem uses cached WIT API instance", async () => {
    const witApi = buildWitApi();
    witApi.getWorkItem.mockResolvedValue({ id: 55 });
    witApi.queryByWiql.mockResolvedValue({ workItems: [] });
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);

    const first = await client.getWorkItem("Proj", 55);
    const second = await client.listWorkItems({ project: "Proj", witType: "Task" });

    expect(first.id).toBe(55);
    expect(second).toEqual([]);
    expect(mockGetWorkItemTrackingApi).toHaveBeenCalledTimes(1);
  });

  test("listWorkItems sanitizes WIQL and applies top limit", async () => {
    const witApi = buildWitApi();
    witApi.queryByWiql.mockResolvedValue({
      workItems: [{ id: 7 }, { id: 6 }, { id: 5 }, { id: undefined }],
    });
    witApi.getWorkItems.mockResolvedValue([{ id: 7 }, { id: 6 }]);
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);
    const items = await client.listWorkItems({
      project: "Pro'j",
      witType: "Us'er Story",
      state: "Ne'w",
      assignedTo: "o'hara@example.com",
      parentId: 99.8,
      top: 2,
    });

    expect(items).toHaveLength(2);
    const [wiqlArg, teamContext] = witApi.queryByWiql.mock.calls[0];
    expect(teamContext).toEqual({ project: "Pro'j" });
    expect((wiqlArg as { query: string }).query).toContain("[System.TeamProject] = 'Pro''j'");
    expect((wiqlArg as { query: string }).query).toContain("[System.WorkItemType] = 'Us''er Story'");
    expect((wiqlArg as { query: string }).query).toContain("[System.State] = 'Ne''w'");
    expect((wiqlArg as { query: string }).query).toContain("[System.AssignedTo] = 'o''hara@example.com'");
    expect((wiqlArg as { query: string }).query).toContain("[System.Parent] = 99");
    expect(witApi.getWorkItems).toHaveBeenCalledWith([7, 6], undefined, undefined, undefined, undefined, "Pro'j");
  });

  test("listWorkItems rejects invalid parentId", async () => {
    const witApi = buildWitApi();
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);

    await expect(
      client.listWorkItems({
        project: "Proj",
        witType: "Task",
        parentId: -1,
      })
    ).rejects.toThrow("Invalid parentId");
  });

  test("listWorkItems returns empty when query has no work items", async () => {
    const witApi = buildWitApi();
    witApi.queryByWiql.mockResolvedValue({ workItems: [] });
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);
    const result = await client.listWorkItems({ project: "Proj", witType: "Bug" });

    expect(result).toEqual([]);
    expect(witApi.getWorkItems).not.toHaveBeenCalled();
  });

  test("listWorkItems returns empty when query IDs are undefined", async () => {
    const witApi = buildWitApi();
    witApi.queryByWiql.mockResolvedValue({ workItems: [{ id: undefined }] });
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);
    const result = await client.listWorkItems({ project: "Proj", witType: "Bug", top: 10 });

    expect(result).toEqual([]);
    expect(witApi.getWorkItems).not.toHaveBeenCalled();
  });

  test("updateWorkItem throws when no update fields are supplied", async () => {
    const witApi = buildWitApi();
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);
    await expect(
      client.updateWorkItem({
        project: "Proj",
        workItemId: 10,
      })
    ).rejects.toThrow("No fields to update");
  });

  test("updateWorkItem retries without iteration path when tree is invalid", async () => {
    const witApi = buildWitApi();
    const iterationError = new Error("Invalid tree name for System.IterationPath");
    witApi.updateWorkItem.mockRejectedValueOnce(iterationError).mockResolvedValueOnce({ id: 11 });
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);

    const updated = await client.updateWorkItem({
      project: "Proj",
      workItemId: 11,
      title: "Updated",
      iterationPath: "Proj\\Bad",
      tags: "tag1",
      customFields: { "Custom.Score": 3 },
    });

    expect(updated.id).toBe(11);
    expect(witApi.updateWorkItem).toHaveBeenCalledTimes(2);

    const [, fallbackPatch] = witApi.updateWorkItem.mock.calls[1];
    expect((fallbackPatch as Array<{ path: string }>).some((op) => op.path === "/fields/System.IterationPath")).toBe(false);
  });

  test("updateWorkItem sanitizes HTML content for description and acceptance criteria", async () => {
    const witApi = buildWitApi();
    witApi.updateWorkItem.mockResolvedValue({ id: 12 });
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);
    await client.updateWorkItem({
      project: "Proj",
      workItemId: 12,
      description: "<img src=x onerror=alert(1)>",
      acceptanceCriteria: ["When <i>test</i> runs"],
    });

    const [, patchDocument] = witApi.updateWorkItem.mock.calls[0];
    expect(patchDocument).toEqual(
      expect.arrayContaining([
        {
          op: Operation.Replace,
          path: "/fields/System.Description",
          value: "&lt;img src=x onerror=alert(1)&gt;",
        },
        {
          op: Operation.Replace,
          path: "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
          value: "When &lt;i&gt;test&lt;/i&gt; runs<br/>",
        },
      ])
    );
  });

  test("addAcceptanceCriteria sends markdown list to updateWorkItem", async () => {
    const client = new AzureDevOpsClient(config);
    const updateSpy = jest.spyOn(client, "updateWorkItem").mockResolvedValue({ id: 22 });

    const result = await client.addAcceptanceCriteria("Proj", 22, ["First", "Second"]);

    expect(result.id).toBe(22);
    expect(updateSpy).toHaveBeenCalledWith({
      project: "Proj",
      workItemId: 22,
      description: "- First\n- Second",
    });
  });

  test("addAcceptanceCriteria propagates update errors", async () => {
    const client = new AzureDevOpsClient(config);
    const failure = new Error("update failed");
    jest.spyOn(client, "updateWorkItem").mockRejectedValue(failure);

    await expect(client.addAcceptanceCriteria("Proj", 25, ["One"])).rejects.toThrow("update failed");
  });

  test("addRelation adds default relation link", async () => {
    const witApi = buildWitApi();
    witApi.updateWorkItem.mockResolvedValue({ id: 30 });
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);
    await client.addRelation({
      project: "Proj",
      sourceWorkItemId: 30,
      targetWorkItemId: 31,
    });

    expect(witApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const [, patchDocument, sourceId, project] = witApi.updateWorkItem.mock.calls[0];
    expect(sourceId).toBe(30);
    expect(project).toBe("Proj");
    expect(patchDocument).toEqual([
      {
        op: Operation.Add,
        path: "/relations/-",
        value: {
          rel: "System.LinkTypes.Related",
          url: "https://dev.azure.com/test-org/_apis/wit/workItems/31",
        },
      },
    ]);
  });

  test("addRelation logs and rethrows update errors", async () => {
    const witApi = buildWitApi();
    const failure = new Error("relation failed");
    witApi.updateWorkItem.mockRejectedValue(failure);
    mockGetWorkItemTrackingApi.mockResolvedValue(witApi);

    const client = new AzureDevOpsClient(config);

    await expect(
      client.addRelation({
        project: "Proj",
        sourceWorkItemId: 1,
        targetWorkItemId: 2,
        relationType: "System.LinkTypes.Dependency-forward",
      })
    ).rejects.toThrow("relation failed");

    expect(mockLogger.error).toHaveBeenCalledWith("Failed to add work item relation", failure);
  });
});