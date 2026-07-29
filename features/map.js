/**
 * Map feature for DocsEngine.
 * Enables interactive Leaflet maps with aspect switching.
 */

(function (global) {
  "use strict";

  var _leafletPromise = null;

  function ensureLeaflet() {
    if (_leafletPromise) return _leafletPromise;

    _leafletPromise = new Promise(function (resolve) {
      if (global.L) {
        resolve();
        return;
      }

      // Inject CSS
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/web/engine/vendor/leaflet.css";
      document.head.appendChild(link);

      // Inject JS
      var script = document.createElement("script");
      script.src = "/web/engine/vendor/leaflet.js";
      script.onload = function () {
        var checkReady = setInterval(function () {
          if (global.L) {
            clearInterval(checkReady);
            resolve();
          }
        }, 50);
      };
      document.body.appendChild(script);
    });

    return _leafletPromise;
  }

  var EVIDENCE_BINS = {
    strong: { color: "#15803d", label: "Strong" },
    partial: { color: "#2563eb", label: "Partial" },
    weak: { color: "#d97706", label: "Weak" },
    "not-researched": { color: "#6b7280", label: "Не досліджено" },
  };

  var ASPECTS = {
    readiness: {
      id: "readiness",
      label: "Готовність до наступного кроку",
      get: function (loc) { return loc.readiness; },
      bins: {
        "deep-dive": { color: "#15803d", label: "Готово до deep dive" },
        comparison: { color: "#2563eb", label: "Готово до порівняння" },
        discovery: { color: "#6b7280", label: "Лише discovery" },
        "budget-mismatch": { color: "#b91c1c", label: "Порівняння, але budget mismatch" },
      },
    },
    fit: {
      id: "fit",
      label: "Гіпотеза відповідності",
      get: function (loc) { return loc.fit; },
      bins: {
        strong: { color: "#15803d", label: "Сильна" },
        potential: { color: "#2563eb", label: "Перспективна" },
        conditional: { color: "#d97706", label: "Умовна / budget-sensitive" },
        compromise: { color: "#b45309", label: "Компромісна" },
        unranked: { color: "#6b7280", label: "Ще не оцінено" },
      },
    },
    schoolEvidence: {
      id: "schoolEvidence",
      label: "Дослідженість шкіл",
      get: function (loc) { return loc.evidence.school; },
      bins: EVIDENCE_BINS,
    },
    housingEvidence: {
      id: "housingEvidence",
      label: "Дослідженість житла",
      get: function (loc) { return loc.evidence.housing; },
      bins: EVIDENCE_BINS,
    },
    transportEvidence: {
      id: "transportEvidence",
      label: "Дослідженість транспорту",
      get: function (loc) { return loc.evidence.transport; },
      bins: EVIDENCE_BINS,
    },
    communityEvidence: {
      id: "communityEvidence",
      label: "Дослідженість community",
      get: function (loc) { return loc.evidence.community; },
      bins: EVIDENCE_BINS,
    },
    bcnAccess: {
      id: "bcnAccess",
      label: "Зв'язок із Барселоною",
      get: function (loc) { return loc.bcnAccess; },
      bins: {
        close: { color: "#15803d", label: "Barcelona orbit" },
        medium: { color: "#d97706", label: "Extended commuter orbit" },
        far: { color: "#b91c1c", label: "Regional / не для daily BCN" },
      },
    },
    carDependency: {
      id: "carDependency",
      label: "Автозалежність",
      get: function (loc) { return loc.carDependency; },
      bins: {
        low: { color: "#15803d", label: "Низька" },
        medium: { color: "#d97706", label: "Середня" },
        high: { color: "#b91c1c", label: "Висока" },
        unknown: { color: "#6b7280", label: "Не встановлено" },
      },
    },
    schoolAnchor: {
      id: "schoolAnchor",
      label: "Шкільний якір",
      get: function (loc) { return loc.schoolAnchor; },
      bins: {
        direct: { color: "#0f766e", label: "Безпосередньо в unit" },
        nearby: { color: "#2563eb", label: "Поруч" },
        "route-hypothesis": { color: "#d97706", label: "Route hypothesis" },
        "not-established": { color: "#6b7280", label: "Не встановлено" },
      },
    },
    claimStatus: {
      id: "claimStatus",
      label: "Канонічний статус тверджень",
      get: function (loc) { return loc.claimStatus; },
      bins: {
        "chat-confirmed": { color: "#15803d", label: "Підтверджено в чаті" },
        likely: { color: "#2563eb", label: "Ймовірно / висновок" },
        "needs-verification": { color: "#d97706", label: "Потребує перевірки" },
        "not-researched": { color: "#6b7280", label: "Ще не досліджено" },
      },
    },
  };

  var TILE_THEMES = {
    light: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
      subdomains: "abc",
    },
    dark: {
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      maxZoom: 19,
      subdomains: "abcd",
    },
  };

  function getColorSchemeQuery() {
    return window.matchMedia("(prefers-color-scheme: dark)");
  }

  function cssColorToLuminance(color) {
    color = (color || "").trim();
    if (!color) return null;

    var rgb = null;
    if (color.charAt(0) === "#") {
      var hex = color.slice(1);
      if (hex.length === 3) {
        hex = hex.split("").map(function (ch) { return ch + ch; }).join("");
      }
      if (hex.length === 6) {
        rgb = {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
        };
      }
    } else {
      var match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        rgb = { r: +match[1], g: +match[2], b: +match[3] };
      }
    }

    if (!rgb) return null;
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  }

  function isDarkTheme() {
    var root = document.documentElement;
    var tileTheme = getComputedStyle(root).getPropertyValue("--map-tile-theme").trim();
    if (tileTheme === "dark") return true;
    if (tileTheme === "light") return false;
    if (getColorSchemeQuery().matches) return true;

    var lum = cssColorToLuminance(getComputedStyle(root).getPropertyValue("--bg"));
    return lum !== null && lum < 140;
  }

  function createTileLayer(L, dark) {
    var theme = dark ? TILE_THEMES.dark : TILE_THEMES.light;
    return L.tileLayer(theme.url, {
      attribution: theme.attribution,
      maxZoom: theme.maxZoom,
      subdomains: theme.subdomains,
    });
  }

  function markerStrokeColor() {
    return isDarkTheme() ? "#e5ebe6" : "#ffffff";
  }

  var _mapDataCache = null;

  function getMapData() {
    if (_mapDataCache) return Promise.resolve(_mapDataCache);

    return fetch("/web/map-data.json")
      .then(function (resp) {
        if (!resp.ok) throw new Error("Map data HTTP " + resp.status);
        return resp.json();
      })
      .then(function (payload) {
        var normalized = Array.isArray(payload)
          ? { updatedAt: null, source: null, locations: payload }
          : payload;

        if (!normalized || !Array.isArray(normalized.locations)) {
          throw new Error("Invalid map data");
        }

        _mapDataCache = normalized;
        return normalized;
      });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function initMap(container, opts) {
    await ensureLeaflet();

    var L = global.L;
    opts = opts || {};
    var embed = opts.embed || false;

    if (!container) return;

    if (container._mapThemeHandler) {
      getColorSchemeQuery().removeEventListener("change", container._mapThemeHandler);
      container._mapThemeHandler = null;
    }

    var mapData = await getMapData();
    var locations = mapData.locations;
    var currentAspect = "readiness";

    container.classList.add("map-shell");
    if (embed) {
      container.classList.add("map-shell-embed");
    } else {
      container.classList.add("map-shell-full");
    }
    container.innerHTML = "";

    var summaryDiv = document.createElement("div");
    summaryDiv.className = "map-data-summary";
    var summaryText = locations.length + " decision units";
    if (mapData.updatedAt) summaryText += " · актуалізовано " + mapData.updatedAt;
    summaryDiv.innerHTML = '<span>' + escapeHtml(summaryText) + '</span>';
    if (mapData.source) {
      summaryDiv.innerHTML += '<a href="#/' + escapeHtml(mapData.source) + '">Coverage dashboard</a>';
    }

    var switcherDiv = document.createElement("div");
    switcherDiv.className = "map-switcher-container";
    switcherDiv.setAttribute("role", "group");
    switcherDiv.setAttribute("aria-label", "Шар даних мапи");

    var canvas = document.createElement("div");
    canvas.className = "map-canvas";
    canvas.setAttribute("aria-label", "Інтерактивна мапа досліджених локацій");

    var legendDiv = document.createElement("div");
    legendDiv.className = "map-legend";
    var legendContent = document.createElement("div");
    legendContent.className = "map-legend-content";
    legendDiv.appendChild(legendContent);

    container.appendChild(summaryDiv);
    container.appendChild(switcherDiv);
    container.appendChild(canvas);
    container.appendChild(legendDiv);

    var map = L.map(canvas, {
      scrollWheelZoom: true,
      zoomControl: true,
    });

    var tileLayer = createTileLayer(L, isDarkTheme());
    tileLayer.addTo(map);

    var markerLayer = L.featureGroup().addTo(map);

    function applyBasemapTheme() {
      var dark = isDarkTheme();
      map.removeLayer(tileLayer);
      tileLayer = createTileLayer(L, dark);
      tileLayer.addTo(map);
      renderMarkers(false);
    }

    container._mapThemeHandler = applyBasemapTheme;
    getColorSchemeQuery().addEventListener("change", applyBasemapTheme);

    function createPopup(loc) {
      var aspect = ASPECTS[currentAspect];
      var value = aspect.get(loc);
      var bin = aspect.bins[value];
      var label = bin ? bin.label : value;
      var readiness = ASPECTS.readiness.bins[loc.readiness];
      var profilePath = loc.profilePath || ("cities/" + loc.id + ".md");
      var profileLabel = loc.profileLabel || "Відкрити досьє";

      var html = '<div class="map-popup">' +
        '<div class="map-popup-name">' + escapeHtml(loc.name) + '</div>' +
        '<div class="map-popup-meta">' +
        '<strong>' + escapeHtml(aspect.label) + ':</strong> ' + escapeHtml(label) +
        '</div>';

      if (loc.group) {
        html += '<div class="map-popup-group">' + escapeHtml(loc.group) + '</div>';
      }

      if (currentAspect !== "readiness" && readiness) {
        html += '<div class="map-popup-meta"><strong>Наступний крок:</strong> ' +
          escapeHtml(readiness.label) + '</div>';
      }

      if (loc.freshness) {
        html += '<div class="map-popup-detail"><strong>Evidence:</strong> ' +
          escapeHtml(loc.freshness) + '</div>';
      }

      if (loc.decisionGate) {
        html += '<div class="map-popup-detail"><strong>Gate:</strong> ' +
          escapeHtml(loc.decisionGate) + '</div>';
      }

      html += '<a href="#/' + escapeHtml(profilePath) + '" class="map-popup-link">' +
        escapeHtml(profileLabel) + ' →</a>' +
        '</div>';

      return html;
    }

    function fitAllMarkers() {
      if (markerLayer.getLayers().length === 0) return;
      map.invalidateSize();
      map.fitBounds(markerLayer.getBounds(), {
        padding: embed ? [28, 28] : [48, 48],
        maxZoom: embed ? 9 : 10,
      });
    }

    function scheduleFit() {
      requestAnimationFrame(fitAllMarkers);
      if (typeof setTimeout !== "undefined") {
        setTimeout(fitAllMarkers, 120);
      }
    }

    function renderMarkers(shouldFit) {
      markerLayer.clearLayers();
      var aspect = ASPECTS[currentAspect];

      locations.forEach(function (loc) {
        var value = aspect.get(loc);
        var bin = aspect.bins[value];
        var color = bin ? bin.color : "#95a5a6";

        var marker = L.circleMarker([loc.lat, loc.lng], {
          radius: embed ? 7 : 9,
          fillColor: color,
          color: markerStrokeColor(),
          weight: 2,
          opacity: 1,
          fillOpacity: 0.85,
        }).addTo(markerLayer);

        marker.bindPopup(createPopup(loc));
      });

      if (shouldFit) scheduleFit();
    }

    function updateLegend() {
      if (!legendContent) return;
      var aspect = ASPECTS[currentAspect];
      var html = '<div class="map-legend-title">' + aspect.label + '</div>';
      Object.keys(aspect.bins).forEach(function (value) {
        var bin = aspect.bins[value];
        var count = locations.filter(function (loc) {
          return aspect.get(loc) === value;
        }).length;
        if (!count) return;
        html += '<div class="map-legend-item">' +
          '<span class="map-legend-color" style="background-color: ' + bin.color + '"></span>' +
          '<span>' + bin.label + ' <span class="map-legend-count">' + count + '</span></span>' +
          '</div>';
      });
      legendContent.innerHTML = html;
    }

    function buildSwitcher() {
      switcherDiv.innerHTML = "";
      Object.keys(ASPECTS).forEach(function (key) {
        var aspect = ASPECTS[key];
        var btn = document.createElement("button");
        btn.className = "map-switcher-btn";
        if (aspect.id === currentAspect) btn.classList.add("active");
        btn.type = "button";
        btn.setAttribute("aria-pressed", String(aspect.id === currentAspect));
        btn.textContent = aspect.label;
        btn.onclick = function () {
          currentAspect = aspect.id;
          renderMarkers(false);
          updateLegend();
          buildSwitcher();
        };
        switcherDiv.appendChild(btn);
      });
    }

    buildSwitcher();
    updateLegend();
    renderMarkers(true);

    if (typeof ResizeObserver !== "undefined") {
      var resizeObserver = new ResizeObserver(function () {
        map.invalidateSize();
      });
      resizeObserver.observe(canvas);
    }
  }

  global.DocsEngineFeatures = global.DocsEngineFeatures || {};
  global.DocsEngineFeatures.map = {
    initMap: initMap,
  };
})(typeof window !== "undefined" ? window : this);
