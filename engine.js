/**
 * DocsEngine — generalized docs viewer for markdown-based documentation.
 * Supports hash-based routing, recursive sidebar tree, breadcrumbs, features (search, mermaid, map, diagrams).
 */

(function (global) {
  "use strict";

  var config = null;
  var manifest = null;
  var currentPath = null;
  var featuresLoaded = {};

  // DOM elements
  var sidebarEl = null;
  var breadcrumbEl = null;
  var articleEl = null;
  var sidebarToggle = null;
  var sidebar = null;

  // Utility: normalize and encode paths
  function normalizePath(p) {
    return decodeURIComponent(p).replace(/^\/+/, "").replace(/\\/g, "/");
  }

  function pathFromHash() {
    var hash = location.hash.replace(/^#\/?/, "");
    return normalizePath(hash.split("#")[0]) || "README.md";
  }

  function routeTo(path) {
    var normalized = normalizePath(path);
    location.hash = "#/" + encodeURI(normalized).replace(/%2F/g, "/");
  }

  function encodeDocPath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function dirname(path) {
    var index = path.lastIndexOf("/");
    return index >= 0 ? path.slice(0, index) : "";
  }

  function docSuffix(path) {
    var i = path.lastIndexOf(".");
    return i >= 0 ? path.slice(i + 1).toLowerCase() : "";
  }

  // Detect section for theming (data-section attribute)
  function detectSection(docPath) {
    var parts = docPath.split("/");
    if (parts.length > 1) return parts[0];
    var match = docPath.match(/^(\d{2})-/);
    return match ? "root-" + match[1] : "";
  }

  // Resolve doc href relative to current doc
  function resolveDocHref(href, currentDoc) {
    href = href.trim();
    if (!href || href.startsWith("#") || /^https?:\/\//i.test(href) || href.startsWith("mailto:")) {
      return href;
    }
    if (href.endsWith("/")) href += "README.md";
    var baseParts = dirname(currentDoc).split("/").filter(Boolean);
    var hrefParts = href.split("/");
    var resolved = baseParts.slice();
    hrefParts.forEach(function (part) {
      if (part === "..") resolved.pop();
      else if (part !== ".") resolved.push(part);
    });
    return resolved.join("/");
  }

  // Check if link is external repo link (Casta feature)
  function isExternalRepoLink(href) {
    if (!config.externalRepoPattern) return false;
    return new RegExp(config.externalRepoPattern).test(href);
  }

  // Rewrite links and images in HTML
  function rewriteLinks(html, currentDoc) {
    var div = document.createElement("div");
    div.innerHTML = html;

    div.querySelectorAll("a[href]").forEach(function (anchor) {
      var href = anchor.getAttribute("href");
      if (!href) return;

      // External links
      if (/^https?:\/\//i.test(href)) {
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noreferrer");
        return;
      }

      // Hash/mailto
      if (href.startsWith("#") || href.startsWith("mailto:")) return;

      // Known docs always stay inside the wiki, even when their folder name
      // also matches an external sibling-repository alias.
      if (/\.(md|mmd|sql)(#.*)?$/i.test(href)) {
        var split = href.split("#");
        var target = resolveDocHref(split[0], currentDoc);
        if (manifest && manifest.titles && manifest.titles[target]) {
          var hash = split[1] ? "#" + split[1] : "";
          anchor.setAttribute("href", "#/" + target + hash);
          anchor.addEventListener("click", function (event) {
            event.preventDefault();
            routeTo(target);
          });
          return;
        }
      }

      // External repo link (Casta)
      if (isExternalRepoLink(href)) {
        anchor.classList.add("link-external-repo");
        return;
      }

      // Unknown docs still route through the viewer and surface its explicit
      // load error instead of silently navigating away from the SPA.
      if (/\.(md|mmd|sql)(#.*)?$/i.test(href)) {
        var unknownSplit = href.split("#");
        var unknownTarget = resolveDocHref(unknownSplit[0], currentDoc);
        anchor.setAttribute("href", "#/" + unknownTarget);
        anchor.addEventListener("click", function (event) {
          event.preventDefault();
          routeTo(unknownTarget);
        });
      }
    });

    // Rewrite image paths
    div.querySelectorAll("img[src]").forEach(function (img) {
      var src = img.getAttribute("src");
      if (!src || /^https?:\/\//i.test(src) || src.startsWith("data:")) return;
      var parts = dirname(currentDoc) ? dirname(currentDoc).split("/") : [];
      src.split("/").forEach(function (part) {
        if (part === "..") parts.pop();
        else if (part !== "." && part) parts.push(part);
      });
      img.setAttribute("src", "/" + parts.join("/"));
    });

    // Wrap tables for horizontal scroll
    div.querySelectorAll("table").forEach(function (table) {
      var wrap = document.createElement("div");
      wrap.className = "table-scroll";
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });

    return div.innerHTML;
  }

  // Create a nav link <li><a>
  function navLink(path, label, activePath) {
    var li = document.createElement("li");
    var a = document.createElement("a");
    a.href = "#/" + path;
    a.textContent = label;
    if (path === activePath) a.className = "active";
    a.addEventListener("click", function (event) {
      event.preventDefault();
      routeTo(path);
    });
    li.appendChild(a);
    return li;
  }

  // Check if folder/tree node should be open
  function shouldOpenNode(node, activePath) {
    if (activePath === node.id || activePath.startsWith(node.id + "/")) return true;
    return (node.children || []).some(function (child) {
      return shouldOpenNode(child, activePath);
    });
  }

  // Build tree node recursively (supports nested tree)
  function buildTreeNode(node, activePath) {
    var container = document.createElement("div");

    if (node.children && node.children.length > 0) {
      // Folder with children
      var details = document.createElement("details");
      if (shouldOpenNode(node, activePath)) details.open = true;

      var summary = document.createElement("summary");
      summary.textContent = node.label;
      details.appendChild(summary);

      var ul = document.createElement("ul");

      // Add docs at this level
      if (node.docs) {
        node.docs.forEach(function (doc) {
          ul.appendChild(navLink(doc.path, doc.title, activePath));
        });
      }

      // Add children recursively
      node.children.forEach(function (child) {
        ul.appendChild(buildTreeNode(child, activePath));
      });

      details.appendChild(ul);
      container.appendChild(details);
    } else if (node.docs && node.docs.length > 0) {
      // Leaf node with docs
      var detailsLeaf = document.createElement("details");
      if (shouldOpenNode(node, activePath)) detailsLeaf.open = true;

      var summaryLeaf = document.createElement("summary");
      summaryLeaf.textContent = node.label;
      detailsLeaf.appendChild(summaryLeaf);

      var ulLeaf = document.createElement("ul");
      node.docs.forEach(function (doc) {
        ulLeaf.appendChild(navLink(doc.path, doc.title, activePath));
      });
      detailsLeaf.appendChild(ulLeaf);
      container.appendChild(detailsLeaf);
    } else {
      // Section label only (no docs, no children)
      var li = document.createElement("li");
      li.className = "nav-section";
      var span = document.createElement("span");
      span.textContent = node.label;
      li.appendChild(span);
      container.appendChild(li);
    }

    return container.firstChild;
  }

  // Build sidebar
  function buildSidebar(activePath) {
    if (!sidebarEl || !manifest) return;

    sidebarEl.innerHTML = "";
    var tree = document.createElement("ul");
    tree.className = "nav-tree";

    // Root docs section
    var rootSection = document.createElement("li");
    rootSection.className = "nav-section";
    var rootLabel = document.createElement("span");
    rootLabel.textContent = config.homeLabel || "Home";
    rootSection.appendChild(rootLabel);
    var rootList = document.createElement("ul");
    if (manifest.rootDocs) {
      manifest.rootDocs.forEach(function (doc) {
        rootList.appendChild(navLink(doc.path, doc.title, activePath));
      });
    }
    if (config.features && config.features.map && config.mapRoute) {
      rootList.appendChild(navLink(config.mapRoute, config.mapLabel || "Map", activePath));
    }
    rootSection.appendChild(rootList);
    tree.appendChild(rootSection);

    // Tree nodes (recursive)
    if (manifest.tree) {
      manifest.tree.forEach(function (node) {
        tree.appendChild(buildTreeNode(node, activePath));
      });
    }

    sidebarEl.appendChild(tree);

    // Auto-open active details
    tree.querySelectorAll("details").forEach(function (el) {
      if (el.querySelector("a.active")) el.open = true;
    });
  }

  // Build breadcrumb
  function buildBreadcrumb(docPath) {
    if (!breadcrumbEl || !manifest) return;

    breadcrumbEl.innerHTML = "";
    var home = document.createElement("a");
    home.href = "#/README.md";
    home.textContent = config.homeLabel || "Home";
    home.addEventListener("click", function (event) {
      event.preventDefault();
      routeTo("README.md");
    });
    breadcrumbEl.appendChild(home);

    if (docPath === "README.md") return;

    var parts = docPath.split("/");
    for (var i = 0; i < parts.length; i += 1) {
      var sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "/";
      breadcrumbEl.appendChild(sep);

      var isLast = i === parts.length - 1;
      var accum = parts.slice(0, i + 1).join("/");

      if (isLast) {
        var span = document.createElement("span");
        span.textContent = manifest.titles[docPath] || parts[i];
        breadcrumbEl.appendChild(span);
      } else {
        var folderReadme = accum + "/README.md";
        if (manifest.titles[folderReadme]) {
          var link = document.createElement("a");
          link.href = "#/" + folderReadme;
          link.textContent = parts[i];
          (function (target) {
            link.addEventListener("click", function (event) {
              event.preventDefault();
              routeTo(target);
            });
          })(folderReadme);
          breadcrumbEl.appendChild(link);
        } else {
          var folderSpan = document.createElement("span");
          folderSpan.textContent = parts[i];
          breadcrumbEl.appendChild(folderSpan);
        }
      }
    }
  }

  // Loading/error messages
  function showLoading() {
    if (articleEl) {
      articleEl.classList.add("loading");
      articleEl.innerHTML = '<p class="loading-msg">' + (config.loadingLabel || "Loading...") + '</p>';
    }
  }

  function showError(message) {
    if (articleEl) {
      articleEl.classList.remove("loading");
      articleEl.innerHTML = '<p class="error-msg">' + message + "</p>";
    }
  }

  function mapRoutePath() {
    return config.mapRoute || "map";
  }

  function isMapRoute(path) {
    return !!(config.features && config.features.map && path === mapRoutePath());
  }

  async function renderMapView() {
    var mapPath = mapRoutePath();
    showLoading();
    currentPath = mapPath;
    buildSidebar(mapPath);
    document.body.dataset.section = "";

    if (breadcrumbEl) {
      breadcrumbEl.innerHTML = "";
      var home = document.createElement("a");
      home.href = "#/README.md";
      home.textContent = config.homeLabel || "Home";
      home.addEventListener("click", function (event) {
        event.preventDefault();
        routeTo("README.md");
      });
      breadcrumbEl.appendChild(home);
      var sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "/";
      breadcrumbEl.appendChild(sep);
      var span = document.createElement("span");
      span.textContent = config.mapLabel || "Map";
      breadcrumbEl.appendChild(span);
    }

    if (articleEl) {
      articleEl.classList.remove("loading");
      articleEl.classList.add("map-page");
      articleEl.innerHTML = '<div id="mapView"></div>';
    }

    document.title = (config.mapLabel || "Map") + " | " + (config.titleSuffix || config.brand);
    window.scrollTo({ top: 0, behavior: "instant" });

    await loadFeature("map", "initMap", function (feature) {
      if (feature && feature.initMap) {
        feature.initMap(document.getElementById("mapView"), { embed: false });
      }
    });
  }

  // Load and render markdown document
  async function loadMarkdown(path) {
    showLoading();
    currentPath = path;
    if (articleEl) articleEl.classList.remove("map-page");
    buildSidebar(path);
    buildBreadcrumb(path);
    document.body.dataset.section = detectSection(path);

    try {
      var response = await fetch("/" + encodeDocPath(path), { cache: "no-cache" });
      if (!response.ok) throw new Error("HTTP " + response.status);

      var text = await response.text();
      var suffix = docSuffix(path);

      if (articleEl) articleEl.classList.remove("loading");

      // Mermaid diagram file (.mmd)
      if (suffix === "mmd" && config.features && config.features.mermaid) {
        document.body.classList.add("diagram-page");
        if (articleEl) articleEl.innerHTML = '<pre class="mermaid"></pre>';
        var mermaidEl = document.querySelector(".mermaid");
        if (mermaidEl) mermaidEl.textContent = text.trim();
        await loadFeature("mermaid", "runMermaid", function (feature) {
          if (feature && feature.runMermaid) return feature.runMermaid();
        });
        if (config.features.diagrams) {
          await loadFeature("diagram-viewer", "enhanceAll", function (feature) {
            if (feature && feature.enhanceAll) feature.enhanceAll();
          });
        }
        return;
      }

      document.body.classList.remove("diagram-page");

      // SQL file
      if (suffix === "sql") {
        if (articleEl) {
          var escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          articleEl.innerHTML = '<pre><code class="language-sql">' + escaped + "</code></pre>";
        }
        return;
      }

      // Markdown
      var html = marked.parse(text, { gfm: true, breaks: false });

      // Promote mermaid blocks if feature enabled
      if (config.features && config.features.mermaid) {
        await loadFeature("mermaid", "promoteMermaidBlocks", function (feature) {
          if (feature && feature.promoteMermaidBlocks) {
            html = feature.promoteMermaidBlocks(html);
          }
        });
      }

      html = rewriteLinks(html, path);
      if (articleEl) articleEl.innerHTML = html;

      // Run mermaid if present
      if (config.features && config.features.mermaid) {
        await loadFeature("mermaid", "runMermaid", function (feature) {
          if (feature && feature.runMermaid) return feature.runMermaid();
        });
        if (config.features.diagrams) {
          await loadFeature("diagram-viewer", "enhanceAll", function (feature) {
            if (feature && feature.enhanceAll) feature.enhanceAll();
          });
        }
      }

      // Handle map blocks if feature enabled
      if (config.features && config.features.map && articleEl) {
        var mapBlocks = articleEl.querySelectorAll("pre > code.language-map");
        mapBlocks.forEach(function (codeEl) {
          var preEl = codeEl.parentNode;
          var container = document.createElement("div");
          container.className = "map-embed";
          preEl.parentNode.insertBefore(container, preEl);
          preEl.parentNode.removeChild(preEl);
          loadFeature("map", "initMap", function (feature) {
            if (feature && feature.initMap) feature.initMap(container, { embed: true });
          });
        });
      }

      document.title = (manifest.titles[path] || "Document") + " | " + (config.titleSuffix || config.brand);
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (error) {
      showError("Unable to load " + path + ": " + error.message);
      console.error(error);
    }
  }

  // Load feature on-demand
  function loadFeature(featureName, featureExport, callback) {
    if (featuresLoaded[featureName]) {
      return Promise.resolve(callback(featuresLoaded[featureName]));
    }

    return new Promise(function (resolve) {
      var script = document.createElement("script");
      var assetVersion = config && config.assetVersion
        ? "?v=" + encodeURIComponent(config.assetVersion)
        : "";
      script.src = "/web/engine/features/" + featureName + ".js" + assetVersion;
      script.onload = function () {
        if (window.DocsEngineFeatures && window.DocsEngineFeatures[featureName]) {
          featuresLoaded[featureName] = window.DocsEngineFeatures[featureName];
          Promise.resolve(callback(featuresLoaded[featureName])).then(resolve, function (error) {
            console.warn("Feature initialization failed: " + featureName, error);
            resolve();
          });
          return;
        }
        resolve();
      };
      script.onerror = function () {
        console.warn("Failed to load feature: " + featureName);
        resolve();
      };
      document.body.appendChild(script);
    });
  }

  // Route to path (dispatch)
  function route(path) {
    if (isMapRoute(path)) {
      renderMapView();
      return;
    }
    loadMarkdown(path);
  }

  function resolveInitialCollapsed(storedState, isNarrow) {
    if (isNarrow) return true;
    return storedState === "true";
  }

  // Setup sidebar collapse: desktop in-flow hide, mobile off-canvas drawer.
  function setupSidebarCollapse() {
    if (!sidebar) return;

    var storageKey = "docs-engine-sidebar-collapsed";
    var layoutEl = sidebar.closest(".layout") || document.body;
    var narrowQuery = window.matchMedia("(max-width: 768px)");
    var openBtn = document.getElementById("sidebarOpenBtn");
    var backdrop = document.querySelector(".sidebar-backdrop");

    if (!backdrop) {
      backdrop = document.createElement("button");
      backdrop.type = "button";
      backdrop.className = "sidebar-backdrop";
      backdrop.setAttribute("tabindex", "-1");
      document.body.appendChild(backdrop);
    }

    if (!openBtn) {
      openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.id = "sidebarOpenBtn";
      openBtn.className = "sidebar-open-btn";
      openBtn.setAttribute("aria-controls", "sidebar");
      openBtn.textContent = "☰";
      document.body.appendChild(openBtn);
    }

    function applySidebarCollapsed(collapsed) {
      var expandLabel = config.sidebarExpandLabel || "Open menu";
      var collapseLabel = config.sidebarCollapseLabel || "Close menu";

      sidebar.classList.toggle("collapsed", collapsed);
      sidebar.setAttribute("aria-hidden", String(collapsed));
      layoutEl.classList.toggle("sidebar-collapsed", collapsed);
      document.body.classList.toggle("sidebar-collapsed", collapsed);
      document.body.classList.toggle("sidebar-open", !collapsed);

      openBtn.setAttribute("aria-expanded", "false");
      openBtn.setAttribute("aria-label", expandLabel);
      backdrop.setAttribute("aria-label", collapseLabel);

      if (sidebarToggle) {
        sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
        sidebarToggle.setAttribute("aria-label", collapseLabel);
        sidebarToggle.textContent = config.sidebarCollapseLabel || "✕";
      }
    }

    function setSidebarCollapsed(collapsed, persist) {
      applySidebarCollapsed(collapsed);
      if (persist !== false && !narrowQuery.matches) {
        localStorage.setItem(storageKey, String(collapsed));
      }
    }

    function applyForViewport() {
      setSidebarCollapsed(
        resolveInitialCollapsed(localStorage.getItem(storageKey), narrowQuery.matches),
        false
      );
    }

    applyForViewport();

    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", function (event) {
        event.stopPropagation();
        setSidebarCollapsed(true);
      });
    }

    openBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      setSidebarCollapsed(false);
    });

    backdrop.addEventListener("click", function () {
      setSidebarCollapsed(true);
    });

    if (sidebarEl) {
      sidebarEl.addEventListener("click", function (event) {
        if (narrowQuery.matches && event.target.closest("a")) {
          setSidebarCollapsed(true);
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !sidebar.classList.contains("collapsed") && narrowQuery.matches) {
        setSidebarCollapsed(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        setSidebarCollapsed(!sidebar.classList.contains("collapsed"));
      }
    });

    if (typeof narrowQuery.addEventListener === "function") {
      narrowQuery.addEventListener("change", applyForViewport);
    } else if (typeof narrowQuery.addListener === "function") {
      narrowQuery.addListener(applyForViewport);
    }
  }

  // Initialize engine
  async function init(appConfig) {
    config = appConfig || {};

    // Find DOM elements
    sidebarEl = document.getElementById("sidebarNav");
    breadcrumbEl = document.getElementById("breadcrumb");
    articleEl = document.getElementById("article");
    sidebarToggle = document.getElementById("sidebarToggle");
    sidebar = document.getElementById("sidebar");

    if (!articleEl) {
      console.error("DocsEngine: #article element not found");
      return;
    }

    try {
      var response = await fetch("/manifest.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("Manifest HTTP " + response.status);
      manifest = await response.json();
    } catch (error) {
      showError("Failed to load manifest.json: " + error.message);
      console.error(error);
      return;
    }

    // Setup sidebar collapse
    setupSidebarCollapse();

    // Load search feature if enabled
    if (config.features && config.features.search) {
      await loadFeature("search", "initSearch", function (feature) {
        if (feature && feature.initSearch) {
          feature.initSearch({ manifest: manifest, config: config });
        }
      });
    }

    // Setup hash change listener
    window.addEventListener("hashchange", function () {
      var nextPath = pathFromHash();
      if (manifest && nextPath !== currentPath) {
        route(nextPath);
      }
    });

    // Initial route
    route(pathFromHash());
  }

  // Export
  global.DocsEngine = {
    init: init,
    routeTo: routeTo,
    resolveInitialCollapsed: resolveInitialCollapsed,
  };
})(typeof window !== "undefined" ? window : this);
