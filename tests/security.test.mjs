import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext, Script } from "node:vm";
import test from "node:test";

const engineSource = readFileSync(new URL("../engine.js", import.meta.url), "utf8");

function loadEngine() {
  const sandbox = { console, window: {}, document: {} };
  sandbox.window.window = sandbox.window;
  runInNewContext(engineSource, sandbox);
  return sandbox.window.DocsEngine;
}

test("escapeHtml neutralizes markup-significant characters", () => {
  const { escapeHtml } = loadEngine();
  assert.equal(
    escapeHtml(`<img src=x onerror=alert(1)>"&'`),
    "&lt;img src=x onerror=alert(1)&gt;&quot;&amp;&#039;",
  );
  assert.equal(escapeHtml(null), "");
});

test("isSafeUrl allows relative, fragment, mailto and http(s) URLs only", () => {
  const { isSafeUrl } = loadEngine();
  for (const ok of ["docs/guide.md", "#anchor", "mailto:a@b.c", "https://example.com/x", "http://example.com", "../up.md", "/abs/path.png"]) {
    assert.equal(isSafeUrl(ok, false), true, ok);
  }
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "vbscript:x", "data:text/html,<script>1</script>", "file:///etc/passwd"]) {
    assert.equal(isSafeUrl(bad, false), false, bad);
    assert.equal(isSafeUrl(bad, true), false, bad);
  }
  assert.equal(isSafeUrl("data:image/png;base64,AAA", true), true);
  assert.equal(isSafeUrl("data:image/svg+xml,<svg onload=1>", true), true); // inert in <img>, blocked for links
  assert.equal(isSafeUrl("data:image/png;base64,AAA", false), false);
});

test("normalizePath decodes safely and never throws on malformed input", () => {
  const { normalizePath } = loadEngine();
  assert.equal(normalizePath("/docs/a%20b.md"), "docs/a b.md");
  assert.equal(normalizePath("docs\\sub\\x.md"), "docs/sub/x.md");
  assert.doesNotThrow(() => normalizePath("%E0%A4%A"));
  assert.equal(normalizePath("%E0%A4%A"), "%E0%A4%A");
});

test("vendored libraries are bumped, classic-script compatible, and expose their globals", () => {
  const marked = readFileSync(new URL("../vendor/marked.min.js", import.meta.url), "utf8");
  const mermaid = readFileSync(new URL("../vendor/mermaid.min.js", import.meta.url), "utf8");
  const dompurify = readFileSync(new URL("../vendor/dompurify.min.js", import.meta.url), "utf8");
  const leaflet = readFileSync(new URL("../vendor/leaflet.js", import.meta.url), "utf8");

  for (const [name, src] of [["marked", marked], ["mermaid", mermaid], ["dompurify", dompurify], ["leaflet", leaflet]]) {
    assert.doesNotThrow(() => new Script(src), `${name} must parse as a classic script`);
  }

  assert.match(marked, /marked@18\.2\.1/);
  assert.match(mermaid, /mermaid@12\.3\.0/);
  assert.match(mermaid, /globalThis\["mermaid"\]\s*=/);
  assert.match(mermaid, /"12\.3\.0"/);
  assert.match(dompurify, /dompurify@3\.4\.18/);
  assert.match(leaflet, /Leaflet 1\.9\.4/);
});

test("mermaid feature runs in strict securityLevel", () => {
  const source = readFileSync(new URL("../features/mermaid.js", import.meta.url), "utf8");
  assert.match(source, /securityLevel:\s*"strict"/);
  assert.doesNotMatch(source, /securityLevel:\s*"loose"/);
});

test("engine sanitizes markdown HTML with DOMPurify before DOM insertion", () => {
  assert.match(engineSource, /vendor\/dompurify\.min\.js/);
  assert.match(engineSource, /DOMPurify\.sanitize/);
  assert.match(engineSource, /articleEl\.innerHTML\s*=\s*safeHtml/);
});
