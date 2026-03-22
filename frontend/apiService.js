/* ================================================================
   Vaani — apiService.js
   High-quality speech + translation engine.

   BEHAVIOUR:
   - If window.BHASHINI_API_KEY is set  → use Bhashini ASR + NMT
   - Otherwise                          → fall through to existing system
     (browser Web Speech API + vaani backend translateText)

   SETUP (optional — app works without this):
   In index.html config script, add:
     window.BHASHINI_API_KEY    = "your-key-here";
     window.BHASHINI_USER_ID    = "your-user-id";
     window.BHASHINI_INFERENCE_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline";

   Load order in index.html:
     <script src="apiService.js?v=1"></script>   ← before app.js
================================================================ */

(function () {
  "use strict";

  // ── BHASHINI LANGUAGE CODE MAP ──────────────────────────────────
  // Maps Vaani's internal lang codes to Bhashini's ISO 639-1 codes.
  var BHASHINI_LANG = {
    te: "te", hi: "hi", ta: "ta", kn: "kn", ml: "ml",
    mr: "mr", bn: "bn", gu: "gu", pa: "pa", ur: "ur",
    or: "or", as: "as", ne: "ne", sa: "sa", sd: "sd",
    mai: "mai", doi: "doi", kok: "kok", bho: "bho",
    mwr: "raj", sat: "sat", ks: "ks", brx: "brx",
    "mni-Mtei": "mni", lus: "lus", en: "en",
  };

  function _bhashiniLang(code) {
    return BHASHINI_LANG[code] || code;
  }

  // ── CONFIG CHECK ────────────────────────────────────────────────
  function _bhashiniAvailable() {
    return !!(
      window.BHASHINI_API_KEY &&
      window.BHASHINI_USER_ID &&
      window.BHASHINI_INFERENCE_URL
    );
  }

  // ── BHASHINI: SPEECH TO TEXT ────────────────────────────────────
  // Sends raw audio blob to Bhashini ASR pipeline.
  // Returns the transcript string, or null on failure.
  async function _bhashiniASR(audioBlob, langCode) {
    try {
      const base64Audio = await _blobToBase64(audioBlob);
      const lang        = _bhashiniLang(langCode);

      const payload = {
        pipelineTasks: [
          {
            taskType: "asr",
            config: {
              language:    { sourceLanguage: lang },
              serviceId:   "",          // Bhashini picks best service
              audioFormat: "wav",
              samplingRate: 16000,
            },
          },
        ],
        inputData: {
          audio: [{ audioContent: base64Audio }],
        },
      };

      const resp = await fetch(window.BHASHINI_INFERENCE_URL, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": window.BHASHINI_API_KEY,
          "userID":        window.BHASHINI_USER_ID,
        },
        body:   JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) throw new Error("Bhashini ASR HTTP " + resp.status);
      const data = await resp.json();

      // Navigate Bhashini response structure
      const output = data?.pipelineResponse?.[0]?.output?.[0]?.source;
      if (output && output.trim()) {
        console.log("[Vaani apiService] Bhashini ASR →", output.trim());
        return output.trim();
      }
      return null;
    } catch (err) {
      console.warn("[Vaani apiService] Bhashini ASR failed:", err.message);
      return null;
    }
  }

  // ── BHASHINI: TRANSLATE ─────────────────────────────────────────
  // Translates text using Bhashini NMT pipeline.
  // Returns translated string, or null on failure.
  async function _bhashiniTranslate(text, sourceLang, targetLang) {
    try {
      const src = _bhashiniLang(sourceLang);
      const tgt = _bhashiniLang(targetLang);

      const payload = {
        pipelineTasks: [
          {
            taskType: "translation",
            config: {
              language:  { sourceLanguage: src, targetLanguage: tgt },
              serviceId: "",
            },
          },
        ],
        inputData: {
          input: [{ source: text }],
        },
      };

      const resp = await fetch(window.BHASHINI_INFERENCE_URL, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": window.BHASHINI_API_KEY,
          "userID":        window.BHASHINI_USER_ID,
        },
        body:   JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });

      if (!resp.ok) throw new Error("Bhashini NMT HTTP " + resp.status);
      const data = await resp.json();

      const output = data?.pipelineResponse?.[0]?.output?.[0]?.target;
      if (output && output.trim()) {
        console.log("[Vaani apiService] Bhashini NMT →", output.trim());
        return output.trim();
      }
      return null;
    } catch (err) {
      console.warn("[Vaani apiService] Bhashini NMT failed:", err.message);
      return null;
    }
  }

  // ── HELPER: Blob → Base64 ───────────────────────────────────────
  function _blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload  = function () { resolve(reader.result.split(",")[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC API — attached to window
  // ══════════════════════════════════════════════════════════════════

  /**
   * speechToText(audioBlob, langCode)
   *
   * Converts a recorded audio Blob to text.
   * Primary:  Bhashini ASR  (if key configured)
   * Fallback: browser Web Speech API result already in ctx.transcript
   *           (Web Speech gives us text directly — no blob needed)
   *
   * Returns: Promise<string|null>
   *   — string: recognised text
   *   — null:   recognition failed (caller should use fallback)
   */
  window.speechToText = async function (audioBlob, langCode) {
    if (_bhashiniAvailable() && audioBlob) {
      console.log("[Vaani apiService] Using Bhashini ASR for", langCode);
      const result = await _bhashiniASR(audioBlob, langCode);
      if (result) return result;
      console.warn("[Vaani apiService] Bhashini ASR returned null, caller uses browser fallback");
    }
    // null → caller uses whatever the Web Speech API already produced
    return null;
  };

  /**
   * translateWithAPI(text, sourceLang, targetLang)
   *
   * High-quality translation with Bhashini NMT as primary.
   * Primary:  Bhashini NMT  (if key configured)
   * Fallback: window.translateText (existing Vaani backend)
   *
   * Returns: Promise<string>
   */
  window.translateWithAPI = async function (text, sourceLang, targetLang) {
    if (!text || !text.trim()) return "";

    if (_bhashiniAvailable()) {
      console.log("[Vaani apiService] Using Bhashini NMT", sourceLang, "→", targetLang);
      const result = await _bhashiniTranslate(text, sourceLang, targetLang);
      if (result) return result;
      console.warn("[Vaani apiService] Bhashini NMT failed, falling back to existing system");
    }

    // Fallback: existing Vaani translation pipeline
    if (typeof window.translateText === "function") {
      return window.translateText(text, sourceLang, targetLang);
    }
    return "";
  };

  // ── STATUS HELPER ───────────────────────────────────────────────
  window.apiServiceStatus = function () {
    return {
      bhashiniConfigured: _bhashiniAvailable(),
      note: _bhashiniAvailable()
        ? "Bhashini ASR + NMT active"
        : "Using browser Web Speech + Vaani backend (Bhashini keys not set)",
    };
  };

  console.log(
    "[Vaani apiService] Loaded.",
    _bhashiniAvailable() ? "Bhashini ACTIVE ✓" : "Bhashini not configured — using fallback."
  );

})();
