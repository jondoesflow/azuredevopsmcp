import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import { LogLevel, logger } from "./logger.js";

describe("logger", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    logger.setLevel(LogLevel.INFO);
  });

  test("logs info messages at INFO level", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    logger.info("hello", { key: "value" });

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("[INFO] hello"), { key: "value" });
  });

  test("suppresses debug messages above DEBUG level", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    logger.debug("hidden");

    expect(spy).not.toHaveBeenCalled();
  });

  test("logs debug messages when level is DEBUG", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    logger.setLevel(LogLevel.DEBUG);

    logger.debug("visible");

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("[DEBUG] visible"));
  });

  test("formats Error objects through error method", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    logger.error("failed", new Error("boom"));

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("[ERROR] failed: boom"), expect.any(String));
  });

  test("redacts PAT and API key values from structured logs", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    logger.info("auth attempt", {
      pat: "real-pat-value",
      apiKey: "real-api-key",
      nested: {
        authorization: "Bearer abc123",
      },
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[INFO] auth attempt"),
      expect.objectContaining({
        pat: "[REDACTED]",
        apiKey: "[REDACTED]",
        nested: expect.objectContaining({
          authorization: "[REDACTED]",
        }),
      })
    );
  });
});
