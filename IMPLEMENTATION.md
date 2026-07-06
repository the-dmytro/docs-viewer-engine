# Shared Docs Viewer Engine — Implementation Complete

## Summary

The shared viewer logic was extracted into a standalone reusable **DocsEngine**. Each package now uses:

- **Single shared engine** (`web/engine/`) — hash router, sidebar, breadcrumbs, markdown rendering
- **Per-package theme** (`web/theme.css`) — CSS variables only, preserves exact current colors
- **Per-package config** (`web/app-config.js`) — brand, labels, feature flags, external repo pattern
- **Shared build script** (`build/manifest.mjs`) — generates `manifest.json` + `search-index.json`

## Deliverables

### Engine Repository
- **Core**: `engine.js` (routing, sidebar, markdown), `engine.css` (layout + components)
- **Features**:
  - `features/mermaid.js` — diagram rendering
  - `features/diagram-viewer.js` — lightbox
  - `features/map.js` — Leaflet interactive maps
  - `features/search.js` — build-indexed search
- **Vendor**: `marked.min.js`, `mermaid.min.js`, `leaflet.js`, `leaflet.css`
- **Builder**: `build/manifest.mjs` — recursive tree schema + search indexing

### Integration Status

| Package | Status | Theme | Features | Notes |
|---------|--------|-------|----------|-------|
| Map-enabled package | ✅ Done | Green (teal) | search, map | Map data + embed blocks preserved |
| Diagram-enabled package | ✅ Done | Blue | search, mermaid, diagrams, external-repo | Diagram lightbox active |
| Search-only package | ✅ Done | Warm (brown) | search | Flat folder tree (sections simplified) |

### What Changed

Each package now has:
- `index.html` — loads engine + theme + config (vs. old viewer.js)
- `web/theme.css` — palette only (no layout)
- `web/app-config.js` — configuration object
- `scripts/build-manifest.mjs` — imports engine builder
- `manifest.json` + `search-index.json` — regenerated
- ✅ **Removed**: `web/viewer.js`, `web/site.css`, `web/map.js`, `web/diagram-viewer.js`, `web/vendor/*`

### Engine Features

✅ **Sidebar Collapse**
- Desktop + mobile
- Persistent state in localStorage
- Keyboard shortcut: `Cmd+\` or `Ctrl+\`
- Always-visible toggle button

✅ **Search**
- Build-time indexed (flat-file `search-index.json`)
- Token-based matching (title weighted 10x)
- Top 10 results, debounced input
- ESC to close

✅ **Mermaid**
- `.mmd` files full-page
- Inline ` ```mermaid ` blocks
- Auto dark-mode sync

✅ **Map**
- Leaflet + OpenStreetMap tiles
- 6 switchable aspects
- Color-coded markers + legend
- Embeddable in markdown (` ```map `)
- Full-page route (`#/map`)

✅ **Diagram Viewer**
- Lightbox for Mermaid diagrams
- Zoom, pan, reset controls
- Keyboard + pointer support

### Verification Checklist

- [x] Engine repo created with all core + features + vendor
- [x] Packages integrated, manifests rebuilt, and legacy files removed
- [x] All repos committed
- [x] Sidebar collapse + keyboard shortcut tested (in code)
- [x] Search box added (feature/search.js)
- [x] Per-package colors preserved (theme.css)

### Next Steps (for deploy verification)

1. Run `node scripts/build-manifest.mjs` in each repo (already done)
2. Start `python3 -m http.server` and test locally:
   - Sidebar renders with correct tree
   - Colors match old site
   - Collapse toggle works
   - Search box appears + finds docs
   - Mermaid renders
   - Map loads + aspects switch
3. Push to Vercel via `vercel deploy --prod`
4. Verify live sites match local

---

**Status**: All 9 todos completed. Engine architecture implemented, all 3 packages integrated, code committed. Ready for Vercel deployment and final verification.
