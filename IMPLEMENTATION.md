# Поточна інтеграція DocsEngine

Цей файл описує стан engine у поточному checkout, а не історичний звіт про попередній rollout.

## Межі відповідальності

- `engine.js` — hash routing, Markdown loading, breadcrumbs, recursive sidebar і feature loading.
- `engine.css` — загальна layout/accessibility поведінка без package-specific палітри.
- `build/manifest.mjs` — generic builder для navigation manifest і versioned full-text index.
- `features/search.js` — Unicode-aware search, ranking, snippets, keyboard flow та index validation.
- `features/map.js` — Leaflet map, schema-v2 map data, aspect switching, marker legends і profile routing.
- `features/mermaid.js` і `features/diagram-viewer.js` — rendering, pan/zoom і fullscreen.
- Package-specific taxonomy, labels, map data і theme залишаються в parent repo: `scripts/build-manifest.mjs`, `web/app-config.js`, `web/map-data.json`, `web/theme.css`.

## Builder contract

```javascript
run({ root, skipDirs, rootNavFiles, folderLabels, sectionGroups, search, outputDir });
```

Builder створює тимчасові `manifest.json` і `search-index.json`, валідує спільний `buildId` та count, після чого атомарно замінює попередні артефакти. Runtime приймає versioned schema 2 і legacy array index, але відхиляє invalid schema та build mismatch.

## Перевірка

```bash
node --test tests/*.test.mjs
```

Parent repos додатково запускають власний manifest builder, content validation і browser smoke через локальний HTTP server.

## Статус публікації

Engine публікується окремим commit до parent gitlink update. Parent repo має посилатися лише на вже доступний remote commit.
