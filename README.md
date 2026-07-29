# DocsEngine

A shared, generalized markdown documentation viewer for browser-based SPA docs.

## Features

- Hash-based SPA routing (`#/path/to/doc.md`)
- Recursive sidebar tree navigation
- Breadcrumb trails
- CSS-variable theming (no embedded palette)
- Lazy-loaded optional features:
  - **search** — build-indexed full-text search
  - **mermaid** — diagram rendering (.mmd, inline blocks)
  - **diagrams** — lightbox viewer for mermaid (Casta)
  - **map** — interactive Leaflet maps with aspect switching (Family)
- Mobile-responsive design
- Persistent sidebar collapse with keyboard shortcut (`Cmd+\` or `Ctrl+\`)
- Accessibility: ARIA labels, keyboard navigation, semantic HTML

## Integration

### 1. Add as git submodule
```bash
git submodule add https://github.com/the-dmytro/docs-viewer-engine.git web/engine
```

### 2. Create `web/app-config.js`
```javascript
window.DocsEngineConfig = {
  brand: "My Docs",
  tagline: "Documentation site",
  homeLabel: "Home",
  titleSuffix: "My Docs",
  loadingLabel: "Loading...",
  features: { search: true, mermaid: true, map: false },
  externalRepoPattern: null, // e.g., "casta_traffic_bot|pokerbot" for Casta
};
```

### 3. Create `web/theme.css`
Define only CSS variables (no layout):
```css
:root {
  --bg: #f7f8f6;
  --bg-sidebar: #eef2ee;
  --surface: #ffffff;
  --surface-alt: #f2f5f2;
  --text: #202421;
  --text-muted: #687269;
  --accent: #227c74;
  --accent-soft: #dcebe7;
  --border: #d9dfd9;
  --link: #1f6f69;
  --link-hover: #9b5a38;
  --code-bg: #edf1ed;
  --error: #a23b3b;
  --shadow: 0 1px 3px rgba(32, 36, 33, 0.08);
  --row-stripe: rgba(34, 124, 116, 0.06);
  --font-sans: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --font-serif: Georgia, "Times New Roman", serif;
  --sidebar-width: 304px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #171a18;
    --surface: #232925;
    /* ... dark mode overrides ... */
  }
}

/* Section-specific theme rules (optional) */
body[data-section="cities"] {
  --accent: #227c74;
  --accent-soft: #dcebe7;
}
```

### 4. Create `index.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Docs</title>
  <!-- Engine + theme CSS -->
  <link rel="stylesheet" href="/web/engine/engine.css" />
  <link rel="stylesheet" href="/web/theme.css" />
</head>
<body>
  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <a id="brandLink" href="#/README.md" style="flex: 1;">
          <strong id="brand">My Docs</strong>
        </a>
        <button id="sidebarToggle" aria-expanded="true">✕</button>
      </div>
      <div class="sidebar-content">
        <nav id="sidebarNav"></nav>
      </div>
    </aside>
    <main class="main">
      <div class="breadcrumb" id="breadcrumb"></div>
      <article class="article" id="article"></article>
    </main>
  </div>

  <!-- Engine core -->
  <script src="/web/engine/engine.js"></script>
  <!-- App config -->
  <script src="/web/app-config.js"></script>
  <!-- Init engine -->
  <script>
    if (window.DocsEngineConfig) {
      DocsEngine.init(window.DocsEngineConfig);
    }
  </script>
</body>
</html>
```

### 5. Update `scripts/build-manifest.mjs`
```javascript
#!/usr/bin/env node
import { run } from "./web/engine/build/manifest.mjs";

run({
  root: ".",
  skipDirs: new Set([".git", ".vercel", "web", "scripts", "node_modules"]),
  rootNavFiles: ["README.md", "GUIDE.md"],
  folderLabels: { guides: "Guides", api: "API Reference" },
  sectionGroups: [
    { id: "product", label: "Product", sections: ["guides"] }
  ],
  search: {
    exclude: [/(^|\\/)transcripts\\/.*-raw\\.md$/i],
    tagsBySection: { api: ["contract"] }
  },
  outputDir: ".",
});
```

### 6. Build and serve
```bash
node scripts/build-manifest.mjs
python3 -m http.server 8000
# Visit http://localhost:8000
```

## Manifest Schema

The engine builds a generic recursive tree manifest:

```json
{
  "schemaVersion": 2,
  "buildId": "2026-07-21T...",
  "generatedAt": "2026-07-06T...",
  "rootDocs": [
    { "path": "README.md", "title": "Home" }
  ],
  "tree": [
    {
      "id": "guides",
      "label": "Guides",
      "docs": [{ "path": "guides/intro.md", "title": "Introduction" }],
      "children": []
    }
  ],
  "titles": { "README.md": "Home", "guides/intro.md": "..." },
  "hasSearch": true,
  "search": { "schemaVersion": 2, "buildId": "2026-07-21T...", "count": 2 }
}
```

And a separate `search-index.json`:
```json
{
  "schemaVersion": 2,
  "buildId": "2026-07-21T...",
  "entries": [
    { "path": "README.md", "title": "Home", "headings": [], "text": "...", "section": "Documentation", "tags": [] }
  ]
}
```

## Features in Depth

### Search
Enabled via `features.search: true`. Requires `search-index.json` built by manifest builder.
- Debounced input (200ms)
- Unicode-aware tokenization and multi-token coverage
- Ranking: exact title → title prefix → headings/tags → body
- Full-text snippets and configurable localized labels
- `ArrowUp`, `ArrowDown`, `Enter`, `Escape` keyboard flow
- Explicit unavailable state for missing, invalid, or mismatched indexes
- Legacy array index remains readable during migration

### Mermaid
Enabled via `features.mermaid: true`. Supports:
- `.mmd` files displayed full-page
- Inline ` ```mermaid ` blocks in markdown
- Auto-responds to dark mode changes

### Map
Enabled via `features.map: true`. For Family guide:
- Leaflet-based interactive map
- Segmented aspect switcher (readiness, fit, four evidence layers, Barcelona access, car dependency, school anchor, claim status)
- Legend counts + color-coded markers
- Popup freshness, next decision gate and explicit document route
- Embedded in markdown via ` ```map ` blocks
- Full-page view at `#/map` (requires integration in loader)

`/web/map-data.json` accepts the legacy location array or schema v2:

```json
{
  "schemaVersion": 2,
  "updatedAt": "YYYY-MM-DD",
  "source": "tables/research-coverage-dashboard.md",
  "locations": [
    {
      "id": "example",
      "name": "Example",
      "lat": 41.0,
      "lng": 2.0,
      "profilePath": "cities/example.md",
      "readiness": "comparison",
      "fit": "potential",
      "bcnAccess": "medium",
      "carDependency": "medium",
      "schoolAnchor": "nearby",
      "claimStatus": "needs-verification",
      "evidence": {
        "school": "partial",
        "transport": "partial",
        "housing": "partial",
        "community": "weak"
      },
      "freshness": "Evidence date or boundary",
      "decisionGate": "Next concrete verification"
    }
  ]
}
```

### Diagram Viewer (Casta)
Lightbox viewer for Mermaid diagrams. Auto-enabled when `mermaid` feature is active.

## Deployment on Vercel

1. **Add git submodule via HTTPS:**
   ```bash
   git submodule add https://github.com/the-dmytro/docs-viewer-engine.git web/engine
   ```

2. **Ensure Vercel GitHub app has access to the engine repo.**

3. **Set build command in `vercel.json`:**
   ```json
   {
     "buildCommand": "node scripts/build-manifest.mjs",
     "outputDirectory": "."
   }
   ```

4. **Deploy:**
   ```bash
   vercel deploy --prod
   ```

## Troubleshooting

- **Manifest 404**: Run `node scripts/build-manifest.mjs` to regenerate.
- **Features not loading**: Check browser console for CSP/CORS issues. Ensure feature JS files are at `/web/engine/features/*.js`.
- **Sidebar not collapsing**: Verify `#sidebarToggle` and `#sidebar` exist in HTML.
- **Search empty**: Check that `search-index.json` was generated and is being served.

## License

Private repository. Do not distribute.
