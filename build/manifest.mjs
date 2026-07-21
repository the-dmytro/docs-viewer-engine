/**
 * Generic manifest builder for DocsEngine.
 * Builds stable-path navigation plus a versioned full-text search index.
 */

import {
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

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

function extractTitle(text) {
  const match = text.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : "";
}

function extractHeadings(text) {
  return Array.from(text.matchAll(/^#{1,6}\s+(.+)$/gm), (match) => match[1].trim());
}

function stripMarkdown(text) {
  return text
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/```[^\n]*\n([^]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[>*_`~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesExclusion(path, exclusions) {
  return exclusions.some((rule) => {
    if (rule instanceof RegExp) {
      rule.lastIndex = 0;
      return rule.test(path);
    }
    return typeof rule === "string" && path === rule;
  });
}

function atomicWritePair(outputDir, manifest, searchIndex) {
  const suffix = `.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const manifestPath = join(outputDir, "manifest.json");
  const indexPath = join(outputDir, "search-index.json");
  const manifestTemp = `${manifestPath}${suffix}`;
  const indexTemp = `${indexPath}${suffix}`;

  try {
    writeFileSync(manifestTemp, JSON.stringify(manifest, null, 2));
    writeFileSync(indexTemp, JSON.stringify(searchIndex, null, 2));

    const parsedManifest = JSON.parse(readFileSync(manifestTemp, "utf8"));
    const parsedIndex = JSON.parse(readFileSync(indexTemp, "utf8"));
    if (parsedManifest.search.buildId !== parsedIndex.buildId) {
      throw new Error("Generated search index buildId does not match manifest");
    }
    if (parsedManifest.search.count !== parsedIndex.entries.length) {
      throw new Error("Generated search index count does not match manifest");
    }

    // Commit the index first and manifest last. If the process stops between
    // renames, runtime buildId validation exposes the mismatch instead of
    // silently using a partial build.
    renameSync(indexTemp, indexPath);
    renameSync(manifestTemp, manifestPath);
  } catch (error) {
    for (const path of [manifestTemp, indexTemp]) {
      try {
        unlinkSync(path);
      } catch {
        // The file may already have been atomically renamed or never created.
      }
    }
    throw error;
  }
}

export function run(config) {
  const {
    skipDirs = new Set([".git", ".vercel", "site", "web", "scripts", "node_modules"]),
    rootNavFiles = ["README.md"],
    folderLabels = {},
    sectionGroups = [],
    search = {},
    outputDir = ".",
  } = config;
  const root = config.root || process.cwd();

  function shouldSkipDir(name) {
    return skipDirs.has(name) || name.startsWith(".");
  }

  function collectFiles(dir = root, rel = "") {
    const files = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) {
        if (shouldSkipDir(name)) continue;
        files.push(...collectFiles(full, relPath));
      } else if (!name.startsWith(".") && /\.(md|mmd|sql)$/i.test(name)) {
        files.push(relPath.replace(/\\/g, "/"));
      }
    }
    return files.sort(comparePaths);
  }

  const allFiles = collectFiles();
  const remainingFiles = allFiles.slice();
  const rootDocs = [];
  const folderStructure = {};
  const titles = {};

  function readDocument(path) {
    return readFileSync(join(root, path), "utf8");
  }

  function addRootDocument(path) {
    const content = readDocument(path);
    const title = extractTitle(content) || path;
    rootDocs.push({ path, title });
    titles[path] = title;
  }

  rootNavFiles.forEach((path) => {
    const index = remainingFiles.indexOf(path);
    if (index >= 0) {
      addRootDocument(path);
      remainingFiles.splice(index, 1);
    }
  });

  remainingFiles.forEach((path) => {
    const parts = path.split("/");
    const content = readDocument(path);
    const title = extractTitle(content) || path;
    titles[path] = title;
    if (parts.length === 1) {
      rootDocs.push({ path, title });
      return;
    }
    const folderId = parts[0];
    folderStructure[folderId] ||= [];
    folderStructure[folderId].push({ path, title });
  });

  const sectionNodes = Object.keys(folderStructure)
    .sort(comparePaths)
    .map((folderId) => ({
      id: folderId,
      label: folderLabels[folderId] || folderId,
      docs: folderStructure[folderId],
      children: [],
    }));
  const nodeById = new Map(sectionNodes.map((node) => [node.id, node]));
  const groupedSections = new Set();
  const tree = [];

  for (const group of sectionGroups) {
    if (!group || !group.id || !group.label || !Array.isArray(group.sections)) {
      throw new Error("Each section group requires id, label, and sections");
    }
    const children = [];
    for (const sectionId of group.sections) {
      if (groupedSections.has(sectionId)) {
        throw new Error(`Section ${sectionId} appears in more than once section group`);
      }
      groupedSections.add(sectionId);
      const node = nodeById.get(sectionId);
      if (node) children.push(node);
    }
    if (children.length > 0) {
      tree.push({ id: group.id, label: group.label, docs: [], children });
    }
  }
  sectionNodes.forEach((node) => {
    if (!groupedSections.has(node.id)) tree.push(node);
  });

  const groupLabelBySection = {};
  sectionGroups.forEach((group) => {
    group.sections.forEach((section) => {
      groupLabelBySection[section] = group.label;
    });
  });

  const searchEntries = [];
  const exclusions = search.exclude || [];
  const tagsBySection = search.tagsBySection || {};
  allFiles.forEach((path) => {
    if (matchesExclusion(path, exclusions)) return;
    const content = readDocument(path);
    const folderId = path.includes("/") ? path.split("/")[0] : "root";
    const section = folderId === "root"
      ? (search.rootSectionLabel || "Documentation")
      : (folderLabels[folderId] || folderId);
    const tags = Array.from(new Set([
      folderId,
      groupLabelBySection[folderId],
      ...(tagsBySection[folderId] || []),
    ].filter(Boolean)));
    searchEntries.push({
      path,
      title: titles[path] || extractTitle(content) || path,
      headings: extractHeadings(content),
      text: stripMarkdown(content),
      section,
      tags,
    });
  });

  const buildId = new Date().toISOString();
  const searchIndex = { schemaVersion: 2, buildId, entries: searchEntries };
  const manifest = {
    schemaVersion: 2,
    buildId,
    generatedAt: buildId,
    rootDocs,
    tree,
    titles,
    hasSearch: true,
    search: { schemaVersion: 2, buildId, count: searchEntries.length },
  };

  atomicWritePair(outputDir, manifest, searchIndex);
  console.log(`✓ manifest.json generated (${Object.keys(titles).length} documents)`);
  console.log(`✓ search-index.json generated (${searchEntries.length} entries)`);
  return { manifest, searchIndex };
}
