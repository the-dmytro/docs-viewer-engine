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

  var ASPECTS = {
    fit: {
      id: "fit",
      label: "Fit Summary",
      get: function (loc) { return loc.aspects.fit; },
      bins: {
        strong: { color: "#2ecc71", label: "Strong" },
        potential: { color: "#f39c12", label: "Potential" },
        compromise: { color: "#e74c3c", label: "Compromise" },
        unranked: { color: "#95a5a6", label: "Unranked" },
      },
    },
    bcnAccess: {
      id: "bcnAccess",
      label: "Barcelona Access",
      get: function (loc) { return loc.aspects.bcnAccess; },
      bins: {
        close: { color: "#27ae60", label: "Close (≤30m)" },
        medium: { color: "#f1c40f", label: "Medium (30–60m)" },
        far: { color: "#c0392b", label: "Far / Car-only" },
      },
    },
    carDependency: {
      id: "carDependency",
      label: "Car Dependency",
      get: function (loc) { return loc.aspects.carDependency; },
      bins: {
        low: { color: "#27ae60", label: "Low" },
        medium: { color: "#f39c12", label: "Medium" },
        high: { color: "#e74c3c", label: "High" },
      },
    },
    international: {
      id: "international",
      label: "International Family Signal",
      get: function (loc) { return loc.aspects.international; },
      bins: {
        high: { color: "#8e44ad", label: "High" },
        medium: { color: "#3498db", label: "Medium" },
        low: { color: "#95a5a6", label: "Low/Unknown" },
      },
    },
    school: {
      id: "school",
      label: "School Anchor",
      get: function (loc) { return loc.aspects.school; },
      bins: {
        direct: { color: "#16a085", label: "Direct in-town" },
        nearby: { color: "#2980b9", label: "Nearby ecosystem" },
        none: { color: "#7f8c8d", label: "None identified" },
      },
    },
    status: {
      id: "status",
      label: "Data Status",
      get: function (loc) { return loc.aspects.status; },
      bins: {
        confirmed: { color: "#27ae60", label: "Confirmed" },
        likely: { color: "#f39c12", label: "Likely" },
        "needs-verification": { color: "#e67e22", label: "Needs verification" },
      },
    },
  };

  var TILE_THEMES = {
    light: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    },
    dark: {
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      maxZoom: 19,
    },
  };

  function getColorSchemeQuery() {
    return window.matchMedia("(prefers-color-scheme: dark)");
  }

  function isDarkTheme() {
    return getColorSchemeQuery().matches;
  }

  function createTileLayer(L, dark) {
    var theme = dark ? TILE_THEMES.dark : TILE_THEMES.light;
    return L.tileLayer(theme.url, {
      attribution: theme.attribution,
      maxZoom: theme.maxZoom,
    });
  }

  function markerStrokeColor() {
    return isDarkTheme() ? "#e5ebe6" : "#ffffff";
  }

  var _mapDataCache = null;

  function getMapData() {
    if (_mapDataCache) return Promise.resolve(_mapDataCache);

    return fetch("/web/map-data.json")
      .then(function (resp) { return resp.json(); })
      .then(function (data) {
        _mapDataCache = data;
        return data;
      });
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

    var locations = await getMapData();
    var currentAspect = "fit";

    container.classList.add("map-shell");
    if (embed) {
      container.classList.add("map-shell-embed");
    } else {
      container.classList.add("map-shell-full");
    }
    container.innerHTML = "";

    var switcherDiv = document.createElement("div");
    switcherDiv.className = "map-switcher-container";

    var canvas = document.createElement("div");
    canvas.className = "map-canvas";
    canvas.setAttribute("aria-label", "Interactive map");

    var legendDiv = document.createElement("div");
    legendDiv.className = "map-legend";
    var legendContent = document.createElement("div");
    legendContent.className = "map-legend-content";
    legendDiv.appendChild(legendContent);

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

      var html = '<div class="map-popup">' +
        '<div class="map-popup-name">' + loc.name + '</div>' +
        '<div class="map-popup-meta">' +
        '<strong>' + aspect.label + ':</strong> ' + label +
        '</div>';

      if (loc.group) {
        html += '<div class="map-popup-group">' + loc.group + '</div>';
      }

      html += '<a href="#/cities/' + loc.slug + '" class="map-popup-link">Open profile →</a>' +
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
        html += '<div class="map-legend-item">' +
          '<span class="map-legend-color" style="background-color: ' + bin.color + '"></span>' +
          '<span>' + bin.label + '</span>' +
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
