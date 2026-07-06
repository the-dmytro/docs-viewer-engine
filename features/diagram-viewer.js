(function (global) {
  "use strict";

  var lightboxController = null;

  function findDiagramRoot(el) {
    if (!el) return null;
    if (el.tagName === "svg") return el.parentElement;
    if (el.classList && el.classList.contains("mermaid")) return el;
    if (el.querySelector && el.querySelector("svg")) return el;
    return null;
  }

  /** Continuous zoom factor from wheel/trackpad delta (pixels, lines, or pages). */
  function wheelDeltaToZoomFactor(deltaY, deltaMode, viewportHeight) {
    var delta = deltaY;
    if (deltaMode === 1) {
      delta *= 16;
    } else if (deltaMode === 2) {
      delta *= Math.max(200, viewportHeight * 0.5);
    }
    delta = Math.max(-400, Math.min(400, delta));
    return Math.exp(-delta * 0.0018);
  }

  function getViewBoxSize(svg) {
    var vb = svg.viewBox && svg.viewBox.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      return { x: vb.x || 0, y: vb.y || 0, width: vb.width, height: vb.height };
    }
    var b = svg.getBBox();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }

  function prepareSvgForViewer(svg) {
    var base = getViewBoxSize(svg);
    svg.removeAttribute("style");
    svg.style.display = "block";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.overflow = "visible";
    svg.style.pointerEvents = "none";
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    if (!svg.getAttribute("viewBox")) {
      svg.setAttribute(
        "viewBox",
        base.x + " " + base.y + " " + base.width + " " + base.height
      );
    }
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    return base;
  }

  function copyViewBox(box) {
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }

  function LightboxViewer(viewport, stage, svg) {
    this.viewport = viewport;
    this.stage = stage;
    this.svg = svg;
    this.base = prepareSvgForViewer(svg);
    this.viewBox = copyViewBox(this.base);
    this.minViewWidth = this.base.width / 40;
    this.dragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.viewBoxStart = null;
    this._onResize = this.fit.bind(this);
    this._bind();
    this._apply();
  }

  LightboxViewer.prototype._apply = function () {
    var vb = this.viewBox;
    this.svg.setAttribute(
      "viewBox",
      vb.x + " " + vb.y + " " + vb.width + " " + vb.height
    );
  };

  LightboxViewer.prototype._viewportRect = function () {
    return this.viewport.getBoundingClientRect();
  };

  LightboxViewer.prototype._screenToSvg = function (mx, my) {
    var rect = this._viewportRect();
    var vb = this.viewBox;
    return {
      x: vb.x + (mx / rect.width) * vb.width,
      y: vb.y + (my / rect.height) * vb.height,
    };
  };

  LightboxViewer.prototype.fit = function () {
    var pad = 40;
    var vw = this.viewport.clientWidth - pad;
    var vh = this.viewport.clientHeight - pad;
    if (vw <= 0 || vh <= 0) return;

    var base = this.base;
    var viewAspect = vw / vh;
    var baseAspect = base.width / base.height;
    var box;

    if (viewAspect > baseAspect) {
      var showW = base.height * viewAspect;
      box = {
        x: base.x - (showW - base.width) / 2,
        y: base.y,
        width: showW,
        height: base.height,
      };
    } else {
      var showH = base.width / viewAspect;
      box = {
        x: base.x,
        y: base.y - (showH - base.height) / 2,
        width: base.width,
        height: showH,
      };
    }

    this.viewBox = box;
    this._apply();
  };

  LightboxViewer.prototype.zoomAt = function (factor, mx, my) {
    var vb = this.viewBox;
    var focus = this._screenToSvg(mx, my);
    var newW = Math.max(this.minViewWidth, vb.width / factor);
    var newH = (newW / vb.width) * vb.height;
    var rect = this._viewportRect();
    var nx = focus.x - (mx / rect.width) * newW;
    var ny = focus.y - (my / rect.height) * newH;

    this.viewBox = { x: nx, y: ny, width: newW, height: newH };
    this._apply();
  };

  LightboxViewer.prototype.zoomBy = function (factor) {
    this.zoomAt(
      factor,
      this.viewport.clientWidth / 2,
      this.viewport.clientHeight / 2
    );
  };

  LightboxViewer.prototype._bind = function () {
    var self = this;

    this._onPointerDown = function (ev) {
      if (ev.button !== 0) return;
      if (ev.target.closest("button")) return;
      self.dragging = true;
      self.dragStartX = ev.clientX;
      self.dragStartY = ev.clientY;
      self.viewBoxStart = copyViewBox(self.viewBox);
      self.viewport.setPointerCapture(ev.pointerId);
      self.viewport.classList.add("is-dragging");
    };

    this._onPointerMove = function (ev) {
      if (!self.dragging || !self.viewBoxStart) return;
      var rect = self._viewportRect();
      var dx = ev.clientX - self.dragStartX;
      var dy = ev.clientY - self.dragStartY;
      var vb = self.viewBoxStart;
      self.viewBox = {
        x: vb.x - (dx / rect.width) * vb.width,
        y: vb.y - (dy / rect.height) * vb.height,
        width: vb.width,
        height: vb.height,
      };
      self._apply();
    };

    this._onPointerUp = function (ev) {
      if (!self.dragging) return;
      self.dragging = false;
      self.viewBoxStart = null;
      try {
        self.viewport.releasePointerCapture(ev.pointerId);
      } catch (e) {
        /* ignore */
      }
      self.viewport.classList.remove("is-dragging");
    };

    this._onWheel = function (ev) {
      ev.preventDefault();
      var factor = wheelDeltaToZoomFactor(
        ev.deltaY,
        ev.deltaMode,
        self.viewport.clientHeight
      );
      if (factor === 1) return;
      var rect = self._viewportRect();
      self.zoomAt(factor, ev.clientX - rect.left, ev.clientY - rect.top);
    };

    this.viewport.addEventListener("pointerdown", this._onPointerDown);
    this.viewport.addEventListener("pointermove", this._onPointerMove);
    this.viewport.addEventListener("pointerup", this._onPointerUp);
    this.viewport.addEventListener("pointercancel", this._onPointerUp);
    this.viewport.addEventListener("wheel", this._onWheel, { passive: false });
    window.addEventListener("resize", this._onResize);
  };

  LightboxViewer.prototype.destroy = function () {
    this.viewport.removeEventListener("pointerdown", this._onPointerDown);
    this.viewport.removeEventListener("pointermove", this._onPointerMove);
    this.viewport.removeEventListener("pointerup", this._onPointerUp);
    this.viewport.removeEventListener("pointercancel", this._onPointerUp);
    this.viewport.removeEventListener("wheel", this._onWheel);
    window.removeEventListener("resize", this._onResize);
  };

  function ensureLightbox() {
    var lb = document.getElementById("diagram-lightbox");
    if (lb) return lb;

    lb = document.createElement("div");
    lb.id = "diagram-lightbox";
    lb.className = "diagram-lightbox";
    lb.hidden = true;
    lb.innerHTML =
      '<div class="diagram-lightbox-backdrop" data-close></div>' +
      '<div class="diagram-lightbox-panel" role="dialog" aria-modal="true" aria-label="Переглядач діаграм">' +
      '  <div class="diagram-lightbox-toolbar" role="toolbar">' +
      '    <button type="button" data-zoom-in title="Збільшити">+</button>' +
      '    <button type="button" data-zoom-out title="Зменшити">−</button>' +
      '    <button type="button" data-reset title="Вмістити діаграму">Скинути</button>' +
      '    <button type="button" data-close class="diagram-lightbox-close" title="Закрити">Закрити</button>' +
      "  </div>" +
      '  <div class="diagram-lightbox-viewport"><div class="diagram-lightbox-stage"></div></div>' +
      "</div>";
    document.body.appendChild(lb);

    var toolbar = lb.querySelector(".diagram-lightbox-toolbar");
    if (toolbar && !toolbar.dataset.wired) {
      toolbar.dataset.wired = "1";
      toolbar.addEventListener("click", function (ev) {
        var btn = ev.target.closest("button");
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (btn.hasAttribute("data-close")) {
          closeLightbox();
          return;
        }
        if (!lightboxController) return;
        if (btn.hasAttribute("data-zoom-in")) lightboxController.zoomBy(1.25);
        else if (btn.hasAttribute("data-zoom-out")) lightboxController.zoomBy(1 / 1.25);
        else if (btn.hasAttribute("data-reset")) lightboxController.fit();
      });
    }

    lb.querySelector(".diagram-lightbox-backdrop").addEventListener("click", closeLightbox);

    if (!lb.dataset.escapeWired) {
      lb.dataset.escapeWired = "1";
      document.addEventListener("keydown", function (ev) {
        var box = document.getElementById("diagram-lightbox");
        if (ev.key === "Escape" && box && !box.hidden) closeLightbox();
      });
    }
    return lb;
  }

  function closeLightbox() {
    var lb = document.getElementById("diagram-lightbox");
    if (!lb) return;
    if (lightboxController) {
      lightboxController.destroy();
      lightboxController = null;
    }
    var stage = lb.querySelector(".diagram-lightbox-stage");
    if (stage) stage.innerHTML = "";
    lb.hidden = true;
    document.body.classList.remove("diagram-lightbox-open");
  }

  function openLightbox(svg) {
    if (!svg) return;
    var lb = ensureLightbox();
    var viewport = lb.querySelector(".diagram-lightbox-viewport");
    var stage = lb.querySelector(".diagram-lightbox-stage");

    if (lightboxController) {
      lightboxController.destroy();
      lightboxController = null;
    }
    stage.innerHTML = "";

    var clone = svg.cloneNode(true);
    stage.appendChild(clone);

    lb.hidden = false;
    document.body.classList.add("diagram-lightbox-open");
    void viewport.offsetHeight;

    function initViewer() {
      lightboxController = new LightboxViewer(viewport, stage, clone);
      lightboxController.fit();
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(initViewer);
    });
  }

  function styleInlineSvg(svg) {
    svg.style.maxWidth = "100%";
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.display = "block";
  }

  function enhanceDiagram(root) {
    if (!root || root.closest(".diagram-frame")) return;
    var svg = root.querySelector("svg");
    if (!svg) return;

    styleInlineSvg(svg);

    var frame = document.createElement("div");
    frame.className = "diagram-frame diagram-frame--preview";
    if (document.body.classList.contains("diagram-page")) {
      frame.classList.add("diagram-frame--standalone");
    }

    var toolbar = document.createElement("div");
    toolbar.className = "diagram-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Діаграма");

    var hint = document.createElement("span");
    hint.className = "diagram-toolbar-hint";
    hint.textContent = "Клацніть діаграму, щоб розгорнути";

    var btnExpand = document.createElement("button");
    btnExpand.type = "button";
    btnExpand.className = "diagram-expand-btn";
    btnExpand.textContent = "Розгорнути";
    btnExpand.title = "Відкрити повноекранний переглядач";

    toolbar.appendChild(hint);
    toolbar.appendChild(btnExpand);

    var preview = document.createElement("div");
    preview.className = "diagram-preview";
    preview.setAttribute("role", "button");
    preview.setAttribute("tabindex", "0");
    preview.setAttribute("aria-label", "Розгорнути діаграму");

    root.parentNode.insertBefore(frame, root);
    frame.appendChild(toolbar);
    frame.appendChild(preview);
    preview.appendChild(root);

    function expand() {
      openLightbox(svg);
    }

    btnExpand.addEventListener("click", function (ev) {
      ev.stopPropagation();
      expand();
    });
    preview.addEventListener("click", expand);
    preview.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        expand();
      }
    });
  }

  function enhanceAll() {
    var seen = new Set();
    document.querySelectorAll(".article .mermaid, .article pre.mermaid").forEach(function (el) {
      var root = findDiagramRoot(el);
      if (!root || seen.has(root)) return;
      seen.add(root);
      enhanceDiagram(root);
    });
  }

  global.DiagramViewer = { enhanceAll: enhanceAll, openLightbox: openLightbox };
})(typeof window !== "undefined" ? window : this);
