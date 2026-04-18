/* Vaani — navigation.js v1.1 */
(function () {
  "use strict";

  var currentPageId = "";

  function _ensureBackButton() {
    var btn = document.getElementById("vaani-back-btn");
    if (btn) return btn;

    btn = document.createElement("button");
    btn.id = "vaani-back-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Go back");
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '</svg>';
    btn.addEventListener("click", function () {
      if ((history.state && history.state._depth > 0) || history.length > 1) {
        history.back();
      }
    });
    document.body.appendChild(btn);
    return btn;
  }

  function sync() {
    var btn = _ensureBackButton();
    var depth = history.state && typeof history.state._depth === "number" ? history.state._depth : 0;
    btn.classList.toggle("vn-visible", depth > 0);
  }

  function animateForward(pageId) {
    var next = document.getElementById(pageId);
    if (!next) return;
    if (currentPageId && currentPageId !== pageId) {
      var prev = document.getElementById(currentPageId);
      if (prev) prev.classList.remove("vn-slide-in-right", "vn-slide-in-left");
    }
    currentPageId = pageId;
    next.classList.remove("vn-slide-in-right", "vn-slide-in-left");
    void next.offsetWidth;
    next.classList.add("vn-slide-in-right");
  }

  window.VaaniNav = {
    sync: sync,
    animateForward: animateForward,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sync, { once: true });
  } else {
    sync();
  }
  window.addEventListener("popstate", sync);
})();
