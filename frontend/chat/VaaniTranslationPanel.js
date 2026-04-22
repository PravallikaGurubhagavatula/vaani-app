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
  var queryInputEl = null;
  var languageListEl = null;
  var outsideDownHandler = null;
  var handlersBound = false;
  var lastRenderedQuery = null;

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

  function _buildPanelShell() {
    if (!panelEl) return;
    panelEl.innerHTML =
      '<div class="vaani-tl-section-label">Translation</div>' +
      _toggleRow("Translate messages", "translateEnabled", false) +
      _toggleRow("Transliterate messages", "transliterateEnabled", false) +
      '<div class="vaani-tl-section-label">Target language</div>' +
      '<div class="vaani-tl-dropdown">' +
        '<input type="text" class="vaani-tl-language-search" placeholder="Search language" value="" data-tl-input="languageQuery">' +
        '<div class="vaani-tl-language-list"></div>' +
      "</div>" +
      '<div class="vaani-tl-section-label">Display</div>' +
      _toggleRow("Show below original message", "showBelowOriginal", true);

    queryInputEl = panelEl.querySelector("[data-tl-input='languageQuery']");
    languageListEl = panelEl.querySelector(".vaani-tl-language-list");
  }

  function _bindHandlers() {
    if (!panelEl || handlersBound) return;
    handlersBound = true;

    panelEl.addEventListener("click", function (event) {
      var toggleBtn = event.target.closest("[data-tl-toggle]");
      if (toggleBtn && panelEl.contains(toggleBtn)) {
        var config = getConfig();
        var key = toggleBtn.getAttribute("data-tl-toggle");
        var current = !!config[key];
        var next = {};
        next[key] = !current;
        updateConfig(Object.assign({}, { panelOpen: true }, next));
        return;
      }

      var languageBtn = event.target.closest("[data-tl-language]");
      if (languageBtn && panelEl.contains(languageBtn)) {
        updateConfig({
          panelOpen: true,
          targetLanguage: languageBtn.getAttribute("data-tl-language"),
          languageQuery: ""
        });
      }
    });

    if (queryInputEl) {
      queryInputEl.addEventListener("input", function (event) {
        updateConfig({ panelOpen: true, languageQuery: event.target.value || "" });
      });
    }
  }

  function _syncView(config) {
    if (!panelEl) return;

    panelEl.style.display = config.panelOpen ? "block" : "none";

    panelEl.querySelectorAll("[data-tl-toggle]").forEach(function (btn) {
      var key = btn.getAttribute("data-tl-toggle");
      var enabled = key === "showBelowOriginal" ? config.showBelowOriginal !== false : !!config[key];
      btn.classList.toggle("is-on", enabled);
      btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    });

    if (queryInputEl) {
      var nextQuery = String(config.languageQuery || "");
      if (queryInputEl.value !== nextQuery) {
        var isFocused = document.activeElement === queryInputEl;
        var start = queryInputEl.selectionStart;
        var end = queryInputEl.selectionEnd;
        queryInputEl.value = nextQuery;
        if (isFocused && start !== null && end !== null) queryInputEl.setSelectionRange(start, end);
      }
    }

    if (languageListEl) {
      languageListEl.innerHTML = _languageOptionsHtml(config);
      var query = String((config && config.languageQuery) || "");
      if (query !== lastRenderedQuery) languageListEl.scrollTo(0, 0);
      lastRenderedQuery = query;
    }
  }

  function render() {
    if (!hostEl) return;
    var config = getConfig();
    if (!panelEl) {
      panelEl = document.createElement("div");
      panelEl.className = "vaani-tl-panel";
      hostEl.appendChild(panelEl);
      _buildPanelShell();
      _bindHandlers();
    }

    _bindOutsideClose(!!config.panelOpen);
    _syncView(config);
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
      queryInputEl = null;
      languageListEl = null;
      handlersBound = false;
      lastRenderedQuery = null;
    }
  };
}

export { createVaaniTranslationPanel, SUPPORTED_LANGUAGES };
