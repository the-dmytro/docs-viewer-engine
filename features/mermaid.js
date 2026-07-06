/**
 * Mermaid feature for DocsEngine.
 * Enables .mmd files and inline mermaid blocks.
 */

(function (global) {
  "use strict";

  var _mermaidPromise = null;

  function ensureMermaid() {
    if (_mermaidPromise) return _mermaidPromise;

    _mermaidPromise = new Promise(function (resolve) {
      if (typeof mermaid !== "undefined" && window.mermaid) {
        resolve();
        return;
      }

      var script = document.createElement("script");
      script.src = "/web/engine/vendor/mermaid.min.js";
      script.onload = function () {
        var checkReady = setInterval(function () {
          if (typeof mermaid !== "undefined" && window.mermaid) {
            clearInterval(checkReady);
            resolve();
          }
        }, 50);
      };
      document.body.appendChild(script);
    });

    return _mermaidPromise;
  }

  function mermaidTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "neutral";
  }

  function promoteMermaidBlocks(html) {
    var div = document.createElement("div");
    div.innerHTML = html;
    div.querySelectorAll("pre code.language-mermaid").forEach(function (code) {
      var pre = code.parentElement;
      var mermaidPre = document.createElement("pre");
      mermaidPre.className = "mermaid";
      mermaidPre.textContent = code.textContent;
      pre.replaceWith(mermaidPre);
    });
    return div.innerHTML;
  }

  async function runMermaid() {
    await ensureMermaid();
    if (typeof mermaid === "undefined") return;

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: mermaidTheme(),
    });

    try {
      await mermaid.run({ querySelector: "#article .mermaid" });
    } catch (e) {
      console.warn("Mermaid render error:", e);
    }
  }

  // Listen for dark mode changes
  if (typeof window !== "undefined") {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      var el = document.querySelector("#article .mermaid");
      if (el) runMermaid();
    });
  }

  global.DocsEngineFeatures = global.DocsEngineFeatures || {};
  global.DocsEngineFeatures.mermaid = {
    promoteMermaidBlocks: promoteMermaidBlocks,
    runMermaid: runMermaid,
  };
})(typeof window !== "undefined" ? window : this);
