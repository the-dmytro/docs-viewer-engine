import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../features/diagram-viewer.js", import.meta.url), "utf8");

test("exports diagram enhancement through the lazy feature registry", () => {
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  runInNewContext(source, sandbox);
  assert.equal(typeof sandbox.window.DocsEngineFeatures["diagram-viewer"].enhanceAll, "function");
});
