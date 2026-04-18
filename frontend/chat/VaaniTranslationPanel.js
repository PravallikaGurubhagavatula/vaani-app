const SUPPORTED_LANGUAGES = Array.from(new Set([
  "Angika", "Assamese", "Awadhi", "Bagri", "Bengali", "Bhili", "Bhojpuri", "Bodo", "Braj", "Bundeli",
  "Chakma", "Chhattisgarhi", "English", "Garhwali", "Garo", "Gondi", "Gujarati", "Halbi", "Haryanvi",
  "Hindi", "Ho", "Jaintia", "Kannada", "Karbi", "Khasi", "Kodava", "Kokborok", "Kolami", "Konkani",
  "Kui", "Kumaoni", "Kurukh", "Kutchi", "Lai", "Lambadi", "Lepcha", "Lotha", "Magahi", "Maithili",
  "Malayalam", "Malvi", "Marathi", "Marwari", "Meitei", "Mewari", "Mishing", "Mizo", "Monpa", "Mundari",
  "Nepali", "Nimadi", "Nyishi", "Odia", "Pahari", "Punjabi", "Rajasthani", "Santali", "Savara", "Sema",
  "Tamil", "Tangkhul", "Telugu", "Thadou", "Tulu", "Urdu"
])).sort(function (a, b) { return a.localeCompare(b); });

function createVaaniTranslationPanel(options) {
  var opts = options || {};
  var hostEl = null;
  var panelEl = null;
  var outsideDownHandler = null;

  function getConfig() {
    return typeof opts.getConfig === "function" ? opts.getConfig() : {};
  }

  function updateConfig(patch) {
    if (typeof opts.onConfigChange === "function") opts.onConfigChange(patch || {});
  }

  function closePanel() {
    updateConfig({ panelOpen: false });
    if (typeof opts.onClose === "function") opts.onClose();
  }

  function _onOutsideDown(event) {
    if (!panelEl || !hostEl) return;
    if (panelEl.contains(event.target)) return;
    if (hostEl.contains(event.target) && event.target.closest(".vaani-tl-toggle-btn")) return;
    closePanel();
  }

  function _bindOutsideClose(open) {
    if (!open && outsideDownHandler) {
      document.removeEventListener("mousedown", outsideDownHandler, true);
      outsideDownHandler = null;
      return;
    }
    if (open && !outsideDownHandler) {
      outsideDownHandler = _onOutsideDown;
      document.addEventListener("mousedown", outsideDownHandler, true);
    }
  }

  function _toggleRow(label, key, enabled) {
    return (
      '<div class="vaani-tl-toggle-row">' +
        '<span class="vaani-tl-toggle-label">' + label + "</span>" +
        '<button type="button" class="vaani-tl-pill' + (enabled ? " is-on" : "") + '" data-tl-toggle="' + key + '" aria-pressed="' + (enabled ? "true" : "false") + '">' +
          '<span class="vaani-tl-pill-thumb"></span>' +
        "</button>" +
      "</div>"
    );
  }

  function _languageOptionsHtml(config) {
    var query = String((config && config.languageQuery) || "").trim().toLowerCase();
    var list = SUPPORTED_LANGUAGES.filter(function (name) {
      return !query || name.toLowerCase().indexOf(query) !== -1;
    });
    return list.map(function (lang) {
      return '<button type="button" class="vaani-tl-language-option' +
        (lang === config.targetLanguage ? " is-selected" : "") +
        '" data-tl-language="' + lang + '">' + lang + "</button>";
    }).join("");
  }

  function render() {
    if (!hostEl) return;
    var config = getConfig();
    if (!panelEl) {
      panelEl = document.createElement("div");
      panelEl.className = "vaani-tl-panel";
      hostEl.appendChild(panelEl);
    }

    panelEl.style.display = config.panelOpen ? "block" : "none";
    panelEl.innerHTML =
      '<div class="vaani-tl-section-label">Translation</div>' +
      _toggleRow("Translate messages", "translateEnabled", !!config.translateEnabled) +
      _toggleRow("Transliterate messages", "transliterateEnabled", !!config.transliterateEnabled) +
      '<div class="vaani-tl-section-label">Target language</div>' +
      '<div class="vaani-tl-dropdown">' +
        '<input type="text" class="vaani-tl-language-search" placeholder="Search language" value="' + String(config.languageQuery || "") + '" data-tl-input="languageQuery">' +
        '<div class="vaani-tl-language-list">' + _languageOptionsHtml(config) + "</div>" +
      "</div>" +
      '<div class="vaani-tl-section-label">Display</div>' +
      _toggleRow("Show below original message", "showBelowOriginal", config.showBelowOriginal !== false);

    _bindOutsideClose(!!config.panelOpen);

    panelEl.querySelectorAll("[data-tl-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-tl-toggle");
        var current = !!config[key];
        updateConfig(Object.assign({}, { panelOpen: true }, (function () {
          var next = {};
          next[key] = !current;
          return next;
        })()));
      });
    });

    var queryInput = panelEl.querySelector("[data-tl-input='languageQuery']");
    if (queryInput) {
      queryInput.addEventListener("input", function () {
        updateConfig({ panelOpen: true, languageQuery: queryInput.value || "" });
      });
    }

    panelEl.querySelectorAll("[data-tl-language]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        updateConfig({
          panelOpen: true,
          targetLanguage: btn.getAttribute("data-tl-language"),
          languageQuery: ""
        });
      });
    });
  }

  return {
    mount: function (host) {
      hostEl = host || null;
      render();
    },
    update: function () { render(); },
    destroy: function () {
      _bindOutsideClose(false);
      if (panelEl && panelEl.parentNode) panelEl.parentNode.removeChild(panelEl);
      panelEl = null;
      hostEl = null;
    }
  };
}

export { createVaaniTranslationPanel, SUPPORTED_LANGUAGES };
