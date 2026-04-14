// @ts-nocheck
import { beforeEach, describe, expect, jest, test, afterEach } from "@jest/globals";

// Mock dependencies BEFORE importing the module under test
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock("./logger.js", () => ({
  logger: mockLogger,
}));

const mockGetProcessDefinition = jest.fn();
jest.mock("./processDefinitions/index.js", () => ({
  getProcessDefinition: mockGetProcessDefinition,
}));

// Mock global fetch
if (!global.fetch) {
  global.fetch = jest.fn();
} else {
  jest.spyOn(global, "fetch");
}

import {
  checkEnrichmentProcessExists,
  checkProjectProcess,
  migrateProcess,
  createProjectWithProcess,
  ensureEnrichmentProcess,
  changeProjectProcess,
  createProcessFromDefinition,
  ensureProcessOnProject,
} from "./processMigration.js";

describe("processMigration", () => {
  const orgUrl = "https://dev.azure.com/org";
  const pat = "test-pat";

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function mockFetchJson(data: any, ok = true, status = 200) {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok,
      status,
      headers: { get: (name: string) => (name === "content-type" ? "application/json" : null) },
      json: async () => data,
      text: async () => JSON.stringify(data),
    });
  }

  function mockFetchError(message: string, status = 500) {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status,
      headers: { get: () => null },
      text: async () => message,
      json: async () => ({ message }),
    });
  }

  describe("checkEnrichmentProcessExists", () => {
    test("returns found: true and process details when Enrichment fields exist", async () => {
      mockFetchJson({
        value: [{ name: "MyProc", typeId: "proc-id-1", customizationType: "inherited", isDefault: false }],
      });
      mockFetchJson({ value: [{ referenceName: "MyWit", name: "My WIT" }] });
      mockFetchJson({
        value: [
          { referenceName: "System.Title", name: "Title" },
          { referenceName: "Custom.EnrichmentSomething", name: "Enrichment Something" },
        ],
      });

      const result = await checkEnrichmentProcessExists(orgUrl, pat);
      expect(result).toEqual({ found: true, processId: "proc-id-1", processName: "MyProc" });
    });

    test("returns found: false when no Enrichment fields exist", async () => {
      mockFetchJson({ value: [{ name: "P", typeId: "id", customizationType: "custom" }] });
      mockFetchJson({ value: [{ referenceName: "W" }] });
      mockFetchJson({ value: [{ referenceName: "Other" }] });

      const result = await checkEnrichmentProcessExists(orgUrl, pat);
      expect(result.found).toBe(false);
    });
  });

  describe("checkProjectProcess", () => {
    test("returns hasCorrectProcess: true when names match", async () => {
      mockFetchJson({
        value: [{ name: "Agile-Enriched", projects: [{ name: "MyProj" }] }],
      });
      const result = await checkProjectProcess(orgUrl, pat, "MyProj", "Agile-Enriched");
      expect(result.hasCorrectProcess).toBe(true);
    });
  });

  describe("migrateProcess", () => {
    const config = {
      sourceOrgUrl: "https://dev.azure.com/src",
      sourceProject: "SP",
      sourceProcessName: "SProc",
      targetOrgUrl: "https://dev.azure.com/tgt",
      targetProject: "TP",
      sourcePat: "spat",
      targetPat: "tpat",
    };

    test("successfully migrates a process", async () => {
      // Phase 1
      mockFetchJson({ value: [{ name: "SProc", typeId: "sid", parentProcessTypeId: "pid" }, { name: "Agile", typeId: "pid" }] });
      mockFetchJson({ value: [{ referenceName: "Wit1", name: "W1", customization: "custom" }] });
      mockFetchJson({ value: [{ referenceName: "Custom.EnrichmentF", name: "EF", type: "string" }] });
      mockFetchJson({ value: [{ name: "NewS", customizationType: "custom", color: "red", stateCategory: "Proposed" }] });
      mockFetchJson({ value: [{ name: "R1", customizationType: "custom", conditions: [], actions: [] }] });
      mockFetchJson({ pages: [{ label: "P1", sections: [{ groups: [{ label: "G1", controls: [{ id: "C1" }] }] }] }] });

      // Phase 2
      mockFetchJson({ value: [{ name: "Agile", typeId: "tpid" }] });
      mockFetchJson({ typeId: "newid", name: "SProc" });
      mockFetchJson({ referenceName: "Custom.EnrichmentF" });
      mockFetchJson({ referenceName: "Wit1" });
      mockFetchJson({}); // add field
      mockFetchJson({}); // add state
      mockFetchJson({}); // add rule
      mockFetchJson({ pages: [] }); // get layout
      mockFetchJson({ id: "pgid", sections: [{ id: "sid" }] }); // create page
      mockFetchJson({ id: "grid" }); // create group
      mockFetchJson({}); // add control

      const result = await migrateProcess(config);
      expect(result.processId).toBe("newid");
    });
  });

  describe("createProjectWithProcess", () => {
    test("polls until success", async () => {
      mockFetchJson({ id: "opid" });
      mockFetchJson({ status: "inProgress" });
      mockFetchJson({ status: "succeeded" });
      mockFetchJson({ id: "projid", name: "P" });

      const promise = createProjectWithProcess(orgUrl, pat, "P", "procid");
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(2000);
      const res = await promise;
      expect(res.projectId).toBe("projid");
    });
  });

  describe("ensureEnrichmentProcess", () => {
    test("skips if not configured", async () => {
      await ensureEnrichmentProcess({});
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("not configured"));
    });

    test("skips if already exists", async () => {
      mockFetchJson({ value: [{ name: "Enc", typeId: "id", customizationType: "custom" }] });
      mockFetchJson({ value: [{ referenceName: "W" }] });
      mockFetchJson({ value: [{ referenceName: "Custom.Enrichment" }] });

      await ensureEnrichmentProcess({
        processMigration: { targetOrgUrl: orgUrl, targetPat: pat }
      });
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("already exists"));
    });
  });

  describe("changeProjectProcess", () => {
    test("polls operation if returned", async () => {
      mockFetchJson({ id: "pid" }); // Get project
      mockFetchJson({ id: "opid" }); // PATCH process
      mockFetchJson({ status: "succeeded" }); // Poll

      const promise = changeProjectProcess(orgUrl, pat, "Proj", "newproc");
      await jest.advanceTimersByTimeAsync(2000);
      await promise;
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("changed successfully"), expect.any(Object));
    });
  });

  describe("createProcessFromDefinition", () => {
    test("creates process and fields from definition", async () => {
      mockFetchJson({ value: [{ name: "Agile", typeId: "apid" }] });
      mockFetchJson({ typeId: "newpid", name: "Proc" });
      mockFetchJson({}); // Create field
      mockFetchJson({}); // Add field to WIT

      const definition = {
        name: "Proc",
        parentProcess: "Agile",
        description: "desc",
        fields: [{ name: "F", referenceName: "Custom.F", type: "string" }],
        workItemTypes: ["Wit1"],
      };

      const res = await createProcessFromDefinition(orgUrl, pat, definition);
      expect(res.processId).toBe("newpid");
    });
  });

  describe("ensureProcessOnProject", () => {
    test("returns already_correct if matches", async () => {
      mockFetchJson({ value: [{ name: "Correct", projects: [{ name: "P" }] }] });
      const res = await ensureProcessOnProject(orgUrl, pat, "P", "Correct");
      expect(res.status).toBe("already_correct");
    });

    test("assigns existing process if found", async () => {
      mockFetchJson({ value: [{ name: "Other", projects: [{ name: "P" }] }] }); // checkProjectProcess
      mockFetchJson({ value: [{ name: "Target", typeId: "tid" }] }); // check target in org
      mockFetchJson({ id: "pid" }); // changeProjectProcess -> get proj
      mockFetchJson({}); // changeProjectProcess -> PATCH (sync)

      const res = await ensureProcessOnProject(orgUrl, pat, "P", "Target");
      expect(res.status).toBe("process_exists_assigned");
    });
  });
});
