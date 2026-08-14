import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const engineSource = readFileSync(new URL("../engine.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../engine.css", import.meta.url), "utf8");

function loadEngine() {
  const sandbox = { console, window: {}, document: {} };
  sandbox.window.window = sandbox.window;
  runInNewContext(engineSource, sandbox);
  return sandbox.window.DocsEngine;
}

test("conceals the sidebar on narrow viewports even if desktop state was open", () => {
  const { resolveInitialCollapsed } = loadEngine();
  assert.equal(resolveInitialCollapsed(null, true), true);
  assert.equal(resolveInitialCollapsed("false", true), true);
  assert.equal(resolveInitialCollapsed("true", true), true);
});

test("keeps desktop sidebar open by default and restores a stored collapsed state", () => {
  const { resolveInitialCollapsed } = loadEngine();
  assert.equal(resolveInitialCollapsed(null, false), false);
  assert.equal(resolveInitialCollapsed("false", false), false);
  assert.equal(resolveInitialCollapsed("true", false), true);
});

test("collapsed sidebar CSS fully conceals the drawer instead of a leaking rail", () => {
  assert.match(css, /\.sidebar\.collapsed\s*\{[^}]*\bwidth:\s*0\b/);
  assert.match(css, /transform:\s*translateX\(-100%\)/);
  assert.match(css, /\.sidebar-open-btn/);
  assert.match(css, /\.sidebar-backdrop/);
  assert.doesNotMatch(css, /sidebar-rail-width/);
  assert.doesNotMatch(css, /width:\s*60px/);
});
