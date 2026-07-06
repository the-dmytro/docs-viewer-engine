/**
 * Generic manifest builder for DocsEngine.
 * Supports flat folders, nested sections (Cooking style), and generates search index.
 *
 * Usage (in each package's build-manifest.mjs):
 *   import { run } from './web/engine/build/manifest.mjs';
 *   run({
 *     skipDirs: new Set(['.git', 'web', 'scripts']),
 *     rootNavFiles: ['README.md', ...],
 *     folderLabels: { cities: 'Cities', ... },
 *     nestedStructure: null, // or { sections: [], packages: [], groups: [] } for Cooking
 *     outputDir: '.'
 *   });
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function run(config) {
  const {
    skipDirs = new Set([".git", ".vercel", "web", "scripts", "node_modules"]),
    rootNavFiles = ["README.md"],
    folderLabels = {},
    outputDir = ".",
  } = config;

  const ROOT = config.root || process.cwd();

  function shouldSkipDir(name) {
    return skipDirs.has(name) || name.startsWith(".");
  }

  function naturalKey(name) {
    return name.split(/(\d+)/).map((part, index) =>
      index % 2 === 1 ? Number(part) : part.toLowerCase()
    );
  }

  function comparePaths(a, b) {
    const aParts = a.split("/");
    const bParts = b.split("/");
    const length = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < length; i += 1) {
      const av = aParts[i] ?? "";
      const bv = bParts[i] ?? "";
      if (av === bv) continue;
      const aReadme = av === "README.md" ? -1 : 0;
      const bReadme = bv === "README.md" ? -1 : 0;
      if (aReadme !== bReadme) return aReadme - bReadme;
      const ak = naturalKey(av);
      const bk = naturalKey(bv);
      for (let j = 0; j < Math.max(ak.length, bk.length); j += 1) {
        if (ak[j] === bk[j]) continue;
        if (ak[j] === undefined) return -1;
        if (bk[j] === undefined) return 1;
        if (typeof ak[j] === "number" && typeof bk[j] === "number") return ak[j] - bk[j];
        return String(ak[j]).localeCompare(String(bk[j]));
      }
    }
    return 0;
  }

  function collectMarkdownFiles(dir = ROOT, rel = "") {
    const files = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) {
        if (shouldSkipDir(name)) continue;
        files.push(...collectMarkdownFiles(full, relPath));
      } else if (!name.startsWith(".") && /\.(md|mmd|sql)$/i.test(name)) {
        files.push(relPath.replace(/\\/g, "/"));
      }
    }
    return files.sort(comparePaths);
  }

  function extractTitle(text) {
    const match = text.match(/^#\s+(.+)/m);
    return match ? match[1].trim() : "";
  }

  function stripMarkdown(text) {
    return text
      .replace(/^[#*_`\[\]()]+/gm, "")
      .replace(/\n+/g, " ")
      .trim()
      .slice(0, 500);
  }

  // Collect all markdown files
  const allFiles = collectMarkdownFiles();

  // Split into root and folder docs
  const rootDocs = [];
  const folderStructure = {};

  rootNavFiles.forEach((path) => {
    const idx = allFiles.indexOf(path);
    if (idx >= 0) {
      try {
        const content = readFileSync(join(ROOT, path), "utf-8");
        const title = extractTitle(content) || path;
        rootDocs.push({ path, title });
        allFiles.splice(idx, 1);
      } catch (e) {
        console.warn(`Could not read ${path}:`, e.message);
      }
    }
  });

  // Group remaining files by top-level folder
  allFiles.forEach((path) => {
    const parts = path.split("/");
    if (parts.length === 1) {
      // Loose file at root, add to root docs
      try {
        const content = readFileSync(join(ROOT, path), "utf-8");
        const title = extractTitle(content) || path;
        rootDocs.push({ path, title });
      } catch (e) {
        console.warn(`Could not read ${path}:`, e.message);
      }
    } else {
      // File in folder
      const folderId = parts[0];
      if (!folderStructure[folderId]) {
        folderStructure[folderId] = [];
      }
      try {
        const content = readFileSync(join(ROOT, path), "utf-8");
        const title = extractTitle(content) || path;
        folderStructure[folderId].push({ path, title });
      } catch (e) {
        console.warn(`Could not read ${path}:`, e.message);
      }
    }
  });

  // Build flat tree from folders
  const tree = Object.keys(folderStructure)
    .sort((a, b) => naturalKey(a).join("") > naturalKey(b).join("") ? 1 : -1)
    .map((folderId) => ({
      id: folderId,
      label: folderLabels[folderId] || folderId,
      docs: folderStructure[folderId],
      children: [],
    }));

  // Build titles index
  const titles = {};
  rootDocs.forEach((doc) => {
    titles[doc.path] = doc.title;
  });
  Object.values(folderStructure).forEach((docs) => {
    docs.forEach((doc) => {
      titles[doc.path] = doc.title;
    });
  });

  // Build search index
  const searchIndex = [];
  [...rootDocs, ...allFiles].forEach((docOrPath) => {
    const path = typeof docOrPath === "string" ? docOrPath : docOrPath.path;
    try {
      const content = readFileSync(join(ROOT, path), "utf-8");
      const title = titles[path] || extractTitle(content) || path;
      const text = stripMarkdown(content);
      searchIndex.push({ path, title, text });
    } catch (e) {
      console.warn(`Could not read ${path} for search index:`, e.message);
    }
  });

  // Build manifest
  const manifest = {
    generatedAt: new Date().toISOString(),
    rootDocs,
    tree,
    titles,
    hasSearch: true,
  };

  // Write manifest.json
  writeFileSync(
    join(outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log("✓ manifest.json generated");

  // Write search-index.json
  writeFileSync(
    join(outputDir, "search-index.json"),
    JSON.stringify(searchIndex, null, 2)
  );
  console.log("✓ search-index.json generated");
}
