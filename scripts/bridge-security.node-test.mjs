import assert from "node:assert/strict";
import test from "node:test";
import {
  configuredBridgeOrigins,
  isCrossSiteBrowserRequest,
  isTrustedBridgeOrigin
} from "./bridge-security.mjs";

test("bridge trusts loopback origins and non-browser callers", () => {
  assert.equal(isTrustedBridgeOrigin(undefined), true);
  assert.equal(isTrustedBridgeOrigin("http://127.0.0.1:5173"), true);
  assert.equal(isTrustedBridgeOrigin("http://localhost:4173"), true);
  assert.equal(isTrustedBridgeOrigin("https://[::1]:5173"), true);
});

test("bridge rejects remote and opaque browser origins by default", () => {
  assert.equal(isTrustedBridgeOrigin("https://attacker.example"), false);
  assert.equal(isTrustedBridgeOrigin("null"), false);
  assert.equal(isTrustedBridgeOrigin("not a url"), false);
  assert.equal(isCrossSiteBrowserRequest("cross-site"), true);
  assert.equal(isCrossSiteBrowserRequest("same-site"), false);
});

test("explicit extra origins are normalized and opt-in", () => {
  const allowed = configuredBridgeOrigins("https://desk.example/path, invalid");
  assert.equal(isTrustedBridgeOrigin("https://desk.example", allowed), true);
  assert.equal(isTrustedBridgeOrigin("https://other.example", allowed), false);
});
