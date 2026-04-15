import { describe, expect, test } from "@jest/globals";

import { getProcessDefinition, listProcessDefinitions } from "./index.js";

describe("process definition registry", () => {
  test("listProcessDefinitions returns registered names", () => {
    const names = listProcessDefinitions();

    expect(names).toContain("Agile with Enrichment");
    expect(names).toContain("Finance and Operations");
  });

  test("getProcessDefinition returns selected definition", () => {
    const definition = getProcessDefinition("Agile with Enrichment");

    expect(definition.name).toBe("Agile with Enrichment");
    expect(definition.fields.length).toBeGreaterThan(0);
  });

  test("getProcessDefinition throws for unknown names", () => {
    expect(() => getProcessDefinition("Unknown Process")).toThrow(/Unknown process definition/);
  });
});
