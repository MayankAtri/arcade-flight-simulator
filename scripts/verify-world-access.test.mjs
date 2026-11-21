import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyWorldAccess } from "./verify-world-access.mjs";

test("rejects missing production credentials without making requests", async () => {
  await assert.rejects(verifyWorldAccess({}, () => assert.fail("unexpected request")), /Set VITE_CESIUM_ION_TOKEN/);
});

test("checks both providers with production referrer and allows a usable endpoint", async () => {
  const calls = [];
  await verifyWorldAccess({ VITE_CESIUM_ION_TOKEN: "test-token", WORLD_CHECK_ORIGIN: "https://flight.example" }, async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Referer, "https://flight.example/");
    return { ok: true, json: async () => ({ url: "https://tiles.example" }) };
  });
  assert.deepEqual(calls.map(url => new URL(url).pathname), ["/v1/assets/1/endpoint", "/v1/assets/2/endpoint", "/v1/assets/96188/endpoint", "/v1/assets/2275207/endpoint"]);
});

test("blocks deployment on rejected credentials without leaking the token", async () => {
  await assert.rejects(verifyWorldAccess({ VITE_CESIUM_ION_TOKEN: "private-token" }, async () => ({ ok: false, status: 401 })), error => {
    assert.match(error.message, /World Terrain.*HTTP 401/);
    assert.match(error.message, /Google 3D Tiles.*HTTP 401/);
    assert.ok(!error.message.includes("private-token"));
    return true;
  });
});

test("blocks malformed responses and hides network error URLs", async () => {
  await assert.rejects(verifyWorldAccess({ VITE_CESIUM_ION_TOKEN: "private-token" }, async () => ({ ok: true, json: async () => ({}) })), /no usable asset endpoint/);
  await assert.rejects(verifyWorldAccess({ VITE_CESIUM_ION_TOKEN: "private-token" }, async () => { throw new Error("private-token"); }), error => !error.message.includes("private-token"));
});
