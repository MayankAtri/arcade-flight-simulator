import { describe, expect, it } from "vitest";
import { describeWorldFailure } from "./worldFailure";

describe("world failure messages", () => {
  it.each([401, 403])("recognizes Cesium's non-Error HTTP %s rejection", (statusCode) => {
    expect(describeWorldFailure("3D scenery", { statusCode, response: "private-token" })).toContain("access was rejected");
  });
  it("never leaks service URLs or tokens into the UI", () => {
    expect(describeWorldFailure("3D scenery", new Error("https://example.com/?access_token=private-token")))
      .toBe("3D scenery could not load. Check your connection and retry.");
  });
  it("distinguishes service limits from connection failures", () => {
    expect(describeWorldFailure("3D scenery", { statusCode: 429 })).toContain("service limit");
    expect(describeWorldFailure("3D scenery", undefined)).toContain("Check your connection");
  });
});
