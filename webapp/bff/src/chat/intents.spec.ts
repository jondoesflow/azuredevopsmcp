import { buildHelpMessage, parseChatIntent } from "./intents.js";

describe("parseChatIntent", () => {
  test("returns listFiles intent", () => {
    const result = parseChatIntent({ message: "Please list files" });
    expect(result).toEqual({ type: "listFiles" });
  });

  test("returns analyse intent with provided metadata", () => {
    const result = parseChatIntent({
      message: "Analyse this",
      fileName: "input.txt",
      analysisMode: "process",
    });

    expect(result).toEqual({
      type: "analyseDocument",
      fileName: "input.txt",
      analysisMode: "process",
    });
  });

  test("returns createBacklog intent when project provided", () => {
    const result = parseChatIntent({
      message: "create backlog",
      project: "GroupTest",
      fileName: "requirements.txt",
    });

    expect(result).toEqual({
      type: "createBacklog",
      project: "GroupTest",
      fileName: "requirements.txt",
      analysisMode: undefined,
    });
  });

  test("returns help for create backlog without project", () => {
    const result = parseChatIntent({ message: "create backlog" });
    expect(result).toEqual({ type: "help" });
  });

  test("returns deleteFile intent", () => {
    const result = parseChatIntent({ message: "delete file", fileName: "x.txt" });
    expect(result).toEqual({ type: "deleteFile", fileName: "x.txt" });
  });
});

describe("buildHelpMessage", () => {
  test("contains user guidance", () => {
    const help = buildHelpMessage();
    expect(help).toContain("list files");
    expect(help).toContain("create backlog");
  });
});
