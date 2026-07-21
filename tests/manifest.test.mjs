import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "../build/manifest.mjs";

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "docs-engine-manifest-"));
  mkdirSync(join(root, "alpha"));
  mkdirSync(join(root, "beta"));
  writeFileSync(join(root, "README.md"), "# Головна\n\nВступ.");
  writeFileSync(
    join(root, "alpha", "README.md"),
    `# Альфа\n\n${"початок ".repeat(90)}унікальнийтермін після межі індексу.`,
  );
  writeFileSync(join(root, "beta", "README.md"), "# Beta service\n\nContract consumer.");
  return root;
}

test("groups physical sections without changing document paths", () => {
  const root = fixtureRoot();

  run({
    root,
    outputDir: root,
    folderLabels: { alpha: "Альфа", beta: "Бета" },
    sectionGroups: [
      { id: "runtime", label: "Backend/runtime", sections: ["alpha", "beta"] },
    ],
  });

  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.tree[0].id, "runtime");
  assert.deepEqual(manifest.tree[0].children.map((item) => item.id), ["alpha", "beta"]);
  assert.equal(manifest.tree[0].children[0].docs[0].path, "alpha/README.md");
});

test("builds a versioned full-text search index past 500 characters", () => {
  const root = fixtureRoot();

  run({ root, outputDir: root, folderLabels: { alpha: "Альфа", beta: "Бета" } });

  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  const index = JSON.parse(readFileSync(join(root, "search-index.json"), "utf8"));
  const alpha = index.entries.find((item) => item.path === "alpha/README.md");

  assert.equal(index.schemaVersion, 2);
  assert.equal(index.buildId, manifest.search.buildId);
  assert.equal(manifest.search.count, index.entries.length);
  assert.match(alpha.text, /унікальнийтермін/);
  assert.deepEqual(alpha.headings, ["Альфа"]);
  assert.equal(alpha.section, "Альфа");
});

test("excludes configured search paths while keeping them in navigation", () => {
  const root = fixtureRoot();
  mkdirSync(join(root, "alpha", "transcripts"));
  writeFileSync(join(root, "alpha", "transcripts", "call-raw.md"), "# Raw\nprivate transcript");

  run({
    root,
    outputDir: root,
    search: { exclude: [/(^|\/)transcripts\/.*-raw\.md$/i] },
  });

  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  const index = JSON.parse(readFileSync(join(root, "search-index.json"), "utf8"));
  assert.ok(manifest.titles["alpha/transcripts/call-raw.md"]);
  assert.equal(index.entries.some((item) => item.path.endsWith("call-raw.md")), false);
});

test("invalid duplicate section grouping preserves previous generated artifacts", () => {
  const root = fixtureRoot();
  writeFileSync(join(root, "manifest.json"), "previous-manifest");
  writeFileSync(join(root, "search-index.json"), "previous-index");

  assert.throws(
    () => run({
      root,
      outputDir: root,
      sectionGroups: [
        { id: "one", label: "One", sections: ["alpha"] },
        { id: "two", label: "Two", sections: ["alpha"] },
      ],
    }),
    /section.*alpha.*more than once/i,
  );

  assert.equal(readFileSync(join(root, "manifest.json"), "utf8"), "previous-manifest");
  assert.equal(readFileSync(join(root, "search-index.json"), "utf8"), "previous-index");
});
