import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../features/search.js", import.meta.url), "utf8");
const sandbox = { console, window: {} };
sandbox.window.window = sandbox.window;
runInNewContext(source, sandbox);
const searchFeature = sandbox.window.DocsEngineFeatures.search;

const entries = [
  {
    path: "server/withdrawals.md",
    title: "Обробка виплат",
    headings: ["Terminal processing"],
    text: "Risk Manager завершує виплату після перевірки provider pipeline.",
    section: "Backend/runtime",
    tags: ["withdrawal", "money"],
  },
  {
    path: "shared/glossary.md",
    title: "Withdrawal",
    headings: ["Термінологія"],
    text: "Загальне визначення withdrawal і payment.",
    section: "Спільне",
    tags: [],
  },
  {
    path: "traffic/attribution.md",
    title: "Traffic attribution",
    headings: ["Перший дотик"],
    text: "Український пошук знаходить термін атрибуція у повному тексті документа.",
    section: "Backend/runtime",
    tags: ["атрибуція"],
  },
];

test("tokenizes Ukrainian and English text across punctuation", () => {
  assert.deepEqual(
    Array.from(searchFeature.tokenize("  Атрибуція, Risk-Manager!  ")),
    ["атрибуція", "risk", "manager"],
  );
});

test("ranks exact title above heading, tag, and body matches", () => {
  const results = searchFeature.search("withdrawal", entries, 10);
  assert.equal(results[0].item.path, "shared/glossary.md");
  assert.equal(results[1].item.path, "server/withdrawals.md");
});

test("adds a coverage bonus for multi-token matches", () => {
  const results = searchFeature.search("risk provider", entries, 10);
  assert.equal(results[0].item.path, "server/withdrawals.md");
  assert.match(results[0].snippet, /Risk Manager.*provider/i);
});

test("normalizes legacy arrays and rejects mismatched versioned indexes", () => {
  assert.equal(searchFeature.normalizeIndexPayload(entries, "build-a").entries.length, 3);
  assert.throws(
    () => searchFeature.normalizeIndexPayload(
      { schemaVersion: 2, buildId: "build-b", entries },
      "build-a",
    ),
    /does not match manifest/i,
  );
});

test("finds Ukrainian terms in tags and returns a focused snippet", () => {
  const results = searchFeature.search("атрибуція", entries, 10);
  assert.equal(results[0].item.path, "traffic/attribution.md");
  assert.match(results[0].snippet, /атрибуція/iu);
  assert.ok(results[0].snippet.length <= 190);
});
