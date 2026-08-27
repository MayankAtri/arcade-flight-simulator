import { describe, expect, it } from "vitest";
import { resolveRequestedWorldMode, resolveWorldMode, usesEvaluationToken } from "./resolveWorldMode";

describe("resolveWorldMode", () => {
  it("uses the Cesium world when a token is configured", () => {
    expect(resolveWorldMode("public-token")).toBe("cesium");
  });

  it("uses Cesium evaluation access when a user token is missing", () => {
    expect(resolveWorldMode("")).toBe("cesium");
    expect(usesEvaluationToken("")).toBe(true);
    expect(usesEvaluationToken("public-token")).toBe(false);
  });

  it("defaults to photorealistic when enabled and keeps an explicit Cesium override", () => {
    expect(resolveRequestedWorldMode("", true)).toBe("photorealistic");
    expect(resolveRequestedWorldMode("?world=photorealistic", true)).toBe("photorealistic");
    expect(resolveRequestedWorldMode("?world=google", true)).toBe("photorealistic");
    expect(resolveRequestedWorldMode("?world=cesium", true)).toBe("cesium");
    expect(resolveRequestedWorldMode("?world=photorealistic", false)).toBe("cesium");
    expect(resolveRequestedWorldMode("?world=cesium", false)).toBe("cesium");
  });
});
