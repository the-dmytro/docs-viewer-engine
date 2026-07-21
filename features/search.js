/**
 * Search feature for DocsEngine.
 * Versioned full-text index, Unicode-aware ranking, accessible sidebar UI.
 */

(function (global) {
  "use strict";

  var searchIndex = null;

  function normalizeText(text) {
    return String(text || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[\p{P}\p{S}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    var normalized = normalizeText(text);
    return normalized ? normalized.split(" ").filter(Boolean) : [];
  }

  function normalizeIndexPayload(payload, expectedBuildId) {
    if (Array.isArray(payload)) {
      return { schemaVersion: 1, buildId: null, entries: payload };
    }
    if (!payload || payload.schemaVersion !== 2 || !Array.isArray(payload.entries)) {
      throw new Error("Unsupported or invalid search index schema");
    }
    if (expectedBuildId && payload.buildId !== expectedBuildId) {
      throw new Error("Search index buildId does not match manifest");
    }
    return payload;
  }

  function tokenFieldScore(token, normalizedTitle, normalizedHeadings, normalizedTags, normalizedBody) {
    if (normalizedTitle === token) return 180;
    if (normalizedTitle.startsWith(token + " ")) return 120;
    if (normalizedTitle.includes(token)) return 90;
    if (normalizedHeadings.includes(token)) return 45;
    if (normalizedTags.includes(token)) return 30;
    if (normalizedBody.includes(token)) return 8;
    return 0;
  }

  function createSnippet(text, queryTokens, maxLength) {
    var source = String(text || "").replace(/\s+/g, " ").trim();
    var limit = maxLength || 180;
    if (!source || source.length <= limit) return source;

    var normalized = normalizeText(source);
    var positions = queryTokens
      .map(function (token) { return normalized.indexOf(token); })
      .filter(function (position) { return position >= 0; });
    var firstMatch = positions.length ? Math.min.apply(Math, positions) : 0;
    var start = Math.max(0, firstMatch - Math.floor(limit / 3));
    var end = Math.min(source.length, start + limit);
    if (end - start < limit) start = Math.max(0, end - limit);
    var snippet = source.slice(start, end).trim();
    if (start > 0) snippet = "…" + snippet;
    if (end < source.length) snippet += "…";
    return snippet;
  }

  function scoreItem(query, item) {
    var queryTokens = tokenize(query);
    if (!queryTokens.length) return null;

    var normalizedQuery = normalizeText(query);
    var normalizedTitle = normalizeText(item.title);
    var normalizedHeadings = normalizeText((item.headings || []).join(" "));
    var normalizedTags = normalizeText((item.tags || []).join(" "));
    var normalizedBody = normalizeText(item.text);
    var score = normalizedTitle === normalizedQuery ? 600 : 0;
    var matched = 0;

    queryTokens.forEach(function (token) {
      var tokenScore = tokenFieldScore(
        token,
        normalizedTitle,
        normalizedHeadings,
        normalizedTags,
        normalizedBody
      );
      if (tokenScore > 0) matched += 1;
      score += tokenScore;
    });

    if (!matched) return null;
    score += Math.round((matched / queryTokens.length) * 80);
    if (matched === queryTokens.length) score += 120;
    return {
      item: item,
      score: score,
      matchedTokens: matched,
      snippet: createSnippet(item.text, queryTokens, 180),
    };
  }

  function search(query, entries, limit) {
    if (!String(query || "").trim()) return [];
    return (entries || [])
      .map(function (item) { return scoreItem(query, item); })
      .filter(Boolean)
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.item.title).localeCompare(String(b.item.title));
      })
      .slice(0, limit || 10);
  }

  function labelsFor(config) {
    var labels = (config && config.searchLabels) || {};
    return {
      placeholder: labels.placeholder || "Search...",
      ariaLabel: labels.ariaLabel || "Search documentation",
      noResults: labels.noResults || "No results",
      loading: labels.loading || "Loading search index...",
      unavailable: labels.unavailable || "Search index is unavailable",
      resultsLabel: labels.resultsLabel || "Search results",
    };
  }

  async function fetchSearchIndex(manifest) {
    if (searchIndex) return searchIndex;
    var response = await fetch("/search-index.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("Search index HTTP " + response.status);
    var payload = await response.json();
    searchIndex = normalizeIndexPayload(
      payload,
      manifest && manifest.search ? manifest.search.buildId : null
    );
    return searchIndex;
  }

  function navigateTo(path) {
    if (window.DocsEngine && typeof window.DocsEngine.routeTo === "function") {
      window.DocsEngine.routeTo(path);
      return;
    }
    location.hash = "#/" + path;
  }

  async function initSearch(opts) {
    var config = opts.config || {};
    var manifest = opts.manifest || {};
    var labels = labelsFor(config);
    var sidebarContent = document.querySelector(".sidebar-content");
    if (!sidebarContent || document.querySelector(".search-box-container")) return;

    var container = document.createElement("div");
    container.className = "search-box-container";

    var input = document.createElement("input");
    input.type = "search";
    input.className = "search-box-input";
    input.placeholder = labels.placeholder;
    input.setAttribute("aria-label", labels.ariaLabel);
    input.setAttribute("aria-controls", "docs-search-results");
    input.setAttribute("aria-expanded", "false");
    input.disabled = true;

    var status = document.createElement("div");
    status.className = "search-status";
    status.setAttribute("role", "status");
    status.textContent = labels.loading;

    var resultsContainer = document.createElement("div");
    resultsContainer.id = "docs-search-results";
    resultsContainer.className = "search-results";
    resultsContainer.setAttribute("role", "listbox");
    resultsContainer.setAttribute("aria-label", labels.resultsLabel);
    resultsContainer.hidden = true;

    container.appendChild(input);
    container.appendChild(status);
    container.appendChild(resultsContainer);
    sidebarContent.insertBefore(container, sidebarContent.firstChild);

    var entries;
    try {
      entries = (await fetchSearchIndex(manifest)).entries;
      if (!entries.length) throw new Error("Search index contains no entries");
      status.textContent = "";
      status.hidden = true;
      input.disabled = false;
    } catch (error) {
      status.textContent = labels.unavailable;
      status.classList.add("error");
      input.disabled = true;
      console.error("Failed to initialize search:", error);
      return;
    }

    var debounceTimer = null;
    var resultLinks = [];
    var activeIndex = -1;

    function setExpanded(expanded) {
      resultsContainer.hidden = !expanded;
      input.setAttribute("aria-expanded", String(expanded));
    }

    function setActive(nextIndex) {
      resultLinks.forEach(function (link, index) {
        var selected = index === nextIndex;
        link.classList.toggle("active", selected);
        link.setAttribute("aria-selected", String(selected));
      });
      activeIndex = nextIndex;
      if (activeIndex >= 0) resultLinks[activeIndex].scrollIntoView({ block: "nearest" });
    }

    function closeResults(clearInput) {
      setExpanded(false);
      setActive(-1);
      if (clearInput) input.value = "";
    }

    function renderResults(query) {
      var results = search(query, entries, 15);
      resultsContainer.innerHTML = "";
      resultLinks = [];
      activeIndex = -1;

      if (!results.length) {
        var empty = document.createElement("div");
        empty.className = "search-result-empty";
        empty.textContent = labels.noResults;
        resultsContainer.appendChild(empty);
        setExpanded(true);
        return;
      }

      results.forEach(function (result) {
        var link = document.createElement("a");
        link.href = "#/" + result.item.path;
        link.className = "search-result-item";
        link.setAttribute("role", "option");
        link.setAttribute("aria-selected", "false");

        var title = document.createElement("strong");
        title.className = "search-result-title";
        title.textContent = result.item.title;

        var meta = document.createElement("span");
        meta.className = "search-result-meta";
        meta.textContent = [result.item.section, result.item.path].filter(Boolean).join(" · ");

        var snippet = document.createElement("span");
        snippet.className = "search-result-snippet";
        snippet.textContent = result.snippet;

        link.appendChild(title);
        link.appendChild(meta);
        link.appendChild(snippet);
        link.addEventListener("click", function (event) {
          event.preventDefault();
          navigateTo(result.item.path);
          closeResults(true);
        });
        resultsContainer.appendChild(link);
        resultLinks.push(link);
      });
      setExpanded(true);
    }

    input.addEventListener("input", function (event) {
      clearTimeout(debounceTimer);
      var query = event.target.value;
      if (!query.trim()) {
        closeResults(false);
        return;
      }
      debounceTimer = setTimeout(function () { renderResults(query); }, 200);
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeResults(true);
        return;
      }
      if (!resultLinks.length || resultsContainer.hidden) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((activeIndex + 1) % resultLinks.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((activeIndex - 1 + resultLinks.length) % resultLinks.length);
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        resultLinks[activeIndex].click();
      }
    });

    document.addEventListener("click", function (event) {
      if (!container.contains(event.target)) closeResults(false);
    });
  }

  global.DocsEngineFeatures = global.DocsEngineFeatures || {};
  global.DocsEngineFeatures.search = {
    initSearch: initSearch,
    normalizeIndexPayload: normalizeIndexPayload,
    search: search,
    tokenize: tokenize,
    createSnippet: createSnippet,
  };
})(typeof window !== "undefined" ? window : this);
