/**
 * Search feature for DocsEngine.
 * Build-indexed site search with sidebar search box.
 */

(function (global) {
  "use strict";

  var searchIndex = null;
  var config = null;
  var manifest = null;

  async function loadSearchIndex() {
    if (searchIndex) return searchIndex;

    try {
      var resp = await fetch("/search-index.json", { cache: "no-cache" });
      if (!resp.ok) throw new Error("Search index HTTP " + resp.status);
      searchIndex = await resp.json();
      return searchIndex;
    } catch (e) {
      console.warn("Failed to load search index:", e);
      return [];
    }
  }

  function tokenize(text) {
    return text.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function matchScore(query, item) {
    var queryTokens = tokenize(query);
    var titleTokens = tokenize(item.title);
    var textTokens = tokenize(item.text);

    var titleMatches = 0;
    var textMatches = 0;

    queryTokens.forEach(function (token) {
      titleTokens.forEach(function (ttoken) {
        if (ttoken.includes(token)) titleMatches++;
      });
      textTokens.forEach(function (ttoken) {
        if (ttoken.includes(token)) textMatches++;
      });
    });

    return titleMatches * 10 + textMatches;
  }

  function search(query, index) {
    if (!query.trim()) return [];

    var results = [];
    index.forEach(function (item) {
      var score = matchScore(query, item);
      if (score > 0) {
        results.push({ item: item, score: score });
      }
    });

    results.sort(function (a, b) { return b.score - a.score; });
    return results.slice(0, 10).map(function (r) { return r.item; });
  }

  async function initSearch(opts) {
    config = opts.config || {};
    manifest = opts.manifest || {};

    var index = await loadSearchIndex();
    if (!index || index.length === 0) {
      console.warn("Search index empty or not found");
      return;
    }

    var sidebarHeader = document.querySelector(".sidebar-header");
    if (!sidebarHeader) return;

    // Create search box
    var searchContainer = document.createElement("div");
    searchContainer.className = "search-box-container";
    searchContainer.style.marginTop = "1rem";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "search-box-input";
    searchInput.placeholder = "Search...";
    searchInput.setAttribute("aria-label", "Search documentation");

    var resultsContainer = document.createElement("div");
    resultsContainer.className = "search-results";
    resultsContainer.hidden = true;

    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(resultsContainer);
    sidebarHeader.parentNode.insertBefore(searchContainer, sidebarHeader.nextSibling);

    var debounceTimer = null;

    searchInput.addEventListener("input", function (e) {
      clearTimeout(debounceTimer);
      var query = e.target.value;

      if (!query.trim()) {
        resultsContainer.hidden = true;
        return;
      }

      debounceTimer = setTimeout(function () {
        var results = search(query, index);
        resultsContainer.innerHTML = "";

        if (results.length === 0) {
          resultsContainer.innerHTML = '<div class="search-result-item">No results</div>';
          resultsContainer.hidden = false;
          return;
        }

        results.forEach(function (result) {
          var item = document.createElement("a");
          item.href = "#/" + result.path;
          item.className = "search-result-item";
          item.textContent = result.title;
          item.addEventListener("click", function (e) {
            e.preventDefault();
            // Route to the doc
            if (window.routeTo) {
              window.routeTo(result.path);
            } else {
              location.hash = "#/" + result.path;
            }
            searchInput.value = "";
            resultsContainer.hidden = true;
          });
          resultsContainer.appendChild(item);
        });

        resultsContainer.hidden = false;
      }, 200);
    });

    // Close results on ESC
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        resultsContainer.hidden = true;
        searchInput.value = "";
      }
    });

    // Close results when clicking elsewhere
    document.addEventListener("click", function (e) {
      if (!searchContainer.contains(e.target)) {
        resultsContainer.hidden = true;
      }
    });
  }

  global.DocsEngineFeatures = global.DocsEngineFeatures || {};
  global.DocsEngineFeatures.search = {
    initSearch: initSearch,
  };
})(typeof window !== "undefined" ? window : this);
