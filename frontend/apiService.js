/* ================================================================
   Vaani — apiService.js  v2.0
   Strong speech + translation engine.

   GLOBAL FLAGS (set in index.html config script BEFORE this loads):
   ─────────────────────────────────────────────────────────────────
   window.USE_API = true              // master switch (default: false)
   window.BHASHINI_API_KEY    = "..."
   window.BHASHINI_USER_ID    = "..."
   window.BHASHINI_INFERENCE_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"

   PIPELINE:
   ─────────────────────────────────────────────────────────────────
   USE_API=false → existing system untouched (zero impact)
   USE_API=true  → Bhashini ASR → if fail → browser Web Speech
                   Bhashini NMT → if fail → existing translateText

   EXPOSES:
   ─────────────────────────────────────────────────────────────────
   window.USE_API                         boolean flag
   window.speechToText(blob, lang)        Promise<string|null>
   window.translateWithAPI(text, src, tgt) Promise<string>
   window.startRecording()                starts MediaRecorder → returns controller
   window.apiServiceStatus()              debug info object

   Load order in index.html (already set up from Part 2):
     <script src="apiService.js?v=2"></script>   ← before app.js
================================================================ */

(function () {
  "use strict";

  // ══════════════════════════════════════════════════════════════════
  // GLOBAL FLAG
  // ══════════════════════════════════════════════════════════════════

  // Default false — existing system is used unless explicitly enabled.
  // Set  window.USE_API = true  in index.html to activate Bhashini.
  if (typeof window.USE_API === "undefined") {
    window.USE_API = false;
  }

  // ══════════════════════════════════════════════════════════════════
  // BHASHINI LANGUAGE CODE MAP
  // Maps Vaani's internal codes → Bhashini ISO 639-1 / BCP-47 codes
  // ══════════════════════════════════════════════════════════════════

  var BHASHINI_LANG = {
    te: "te", hi: "hi", ta: "ta", kn: "kn", ml: "ml",
    mr: "mr", bn: "bn", gu: "gu", pa: "pa", ur: "ur",
    or: "or", as: "as", ne: "ne", sa: "sa", sd: "sd",
    mai: "mai", doi: "doi", kok: "kok", bho: "bho",
    mwr: "raj", sat: "sat", ks: "ks", brx: "brx",
    "mni-Mtei": "mni", lus: "lus", gom: "kok",
    awa: "hi",  mag: "hi",  hne: "hi",  bgc: "hi",
    raj: "raj", kha: "kha", lep: "ne",  en: "en",
  };

  function _bLang(code) {
    return BHASHINI_LANG[code] || code;
  }

  // ── Config check ─────────────────────────────────────────────────
  function _bhashiniReady() {
    return !!(
      window.USE_API &&
      window.BHASHINI_API_KEY &&
      window.BHASHINI_USER_ID &&
      window.BHASHINI_INFERENCE_URL
    );
  }

  // Common headers for all Bhashini requests
  function _bhashiniHeaders() {
    return {
      "Content-Type":  "application/json",
      "Authorization": window.BHASHINI_API_KEY,
      "userID":        window.BHASHINI_USER_ID,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // BHASHINI ASR  (Speech → Text)
  // ══════════════════════════════════════════════════════════════════

  async function _bhashiniASR(audioBlob, langCode) {
    try {
      const base64Audio = await _blobToBase64(audioBlob);
      const lang        = _bLang(langCode);

      const payload = {
        pipelineTasks: [
          {
            taskType: "asr",
            config: {
              language:    { sourceLanguage: lang },
              serviceId:   "",           // let Bhashini pick the best service
              audioFormat: "wav",
              samplingRate: 16000,
              postProcessors: ["punctuation"],
            },
          },
        ],
        inputData: {
          audio: [{ audioContent: base64Audio }],
        },
      };

      const resp = await fetch(window.BHASHINI_INFERENCE_URL, {
        method:  "POST",
        headers: _bhashiniHeaders(),
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(20000),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error("Bhashini ASR HTTP " + resp.status + " " + errText.slice(0, 120));
      }

      const data   = await resp.json();
      const output = data?.pipelineResponse?.[0]?.output?.[0]?.source;

      if (output && output.trim()) {
        console.log("[Vaani API] Bhashini ASR ✓", langCode, "→", output.trim().slice(0, 60));
        return output.trim();
      }

      console.warn("[Vaani API] Bhashini ASR returned empty output");
      return null;
    } catch (err) {
      console.warn("[Vaani API] Bhashini ASR failed:", err.message);
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // BHASHINI NMT  (Text Translation)
  // ══════════════════════════════════════════════════════════════════

  async function _bhashiniNMT(text, sourceLang, targetLang) {
    // Bhashini doesn't support same-language translation
    if (sourceLang === targetLang) return text;

    try {
      const src = _bLang(sourceLang);
      const tgt = _bLang(targetLang);

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
        headers: _bhashiniHeaders(),
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(25000),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error("Bhashini NMT HTTP " + resp.status + " " + errText.slice(0, 120));
      }

      const data   = await resp.json();
      const output = data?.pipelineResponse?.[0]?.output?.[0]?.target;

      if (output && output.trim()) {
        console.log("[Vaani API] Bhashini NMT ✓", sourceLang, "→", targetLang, ":", output.trim().slice(0, 60));
        return output.trim();
      }

      console.warn("[Vaani API] Bhashini NMT returned empty output");
      return null;
    } catch (err) {
      console.warn("[Vaani API] Bhashini NMT failed:", err.message);
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // MEDIA RECORDER  (capture audio for Bhashini ASR)
  // Records mic audio as a WAV-compatible Blob.
  // Used by app.js when USE_API=true and Bhashini is ready.
  // ══════════════════════════════════════════════════════════════════

  var _mediaRecorder  = null;
  var _audioChunks    = [];
  var _recordingBlob  = null;

  /**
   * startRecording()
   * Begins capturing audio from the microphone.
   * Returns a controller object: { stop() → Promise<Blob> }
   * Returns null if browser doesn't support MediaRecorder.
   */
  window.startRecording = async function () {
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      console.warn("[Vaani API] MediaRecorder not supported — Bhashini ASR unavailable");
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // Prefer webm/opus for quality; fallback to default
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      _audioChunks = [];
      _mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      _mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) _audioChunks.push(e.data);
      };

      _mediaRecorder.start(100);  // collect chunks every 100ms
      console.log("[Vaani API] Recording started", mimeType || "(default codec)");

      return {
        stop: () => new Promise((resolve) => {
          _mediaRecorder.onstop = () => {
            _recordingBlob = new Blob(_audioChunks, { type: mimeType || "audio/webm" });
            // Stop all tracks so mic indicator disappears
            stream.getTracks().forEach((t) => t.stop());
            console.log("[Vaani API] Recording stopped, blob size:", _recordingBlob.size);
            resolve(_recordingBlob);
          };
          if (_mediaRecorder.state !== "inactive") _mediaRecorder.stop();
          else resolve(null);
        }),
      };
    } catch (err) {
      console.warn("[Vaani API] startRecording failed:", err.message);
      return null;
    }
  };

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: speechToText
  // ══════════════════════════════════════════════════════════════════

  /**
   * window.speechToText(audioBlob, langCode)
   *
   * Primary:  Bhashini ASR  (when USE_API=true and keys configured)
   * Fallback: Returns null → caller uses browser Web Speech transcript
   *
   * @param {Blob|null}  audioBlob  — recorded audio from startRecording()
   * @param {string}     langCode   — Vaani lang code e.g. "te", "hi"
   * @returns {Promise<string|null>}
   */
  window.speechToText = async function (audioBlob, langCode) {
    if (!window.USE_API) return null;

    if (_bhashiniReady() && audioBlob && audioBlob.size > 0) {
      console.log("[Vaani API] speechToText → Bhashini ASR [", langCode, "]");
      const result = await _bhashiniASR(audioBlob, langCode);
      if (result) return result;
      console.warn("[Vaani API] Bhashini ASR failed — falling back to Web Speech result");
    }

    return null;  // caller uses ctx.transcript from Web Speech API
  };

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: translateWithAPI
  // ══════════════════════════════════════════════════════════════════

  /**
   * window.translateWithAPI(text, sourceLang, targetLang)
   *
   * Primary:  Bhashini NMT  (when USE_API=true and keys configured)
   * Fallback: window.translateText (existing Vaani backend in app.js)
   *
   * @param {string} text
   * @param {string} sourceLang  — Vaani lang code e.g. "te"
   * @param {string} targetLang  — Vaani lang code e.g. "en"
   * @returns {Promise<string>}
   */
  window.translateWithAPI = async function (text, sourceLang, targetLang) {
    if (!text || !text.trim()) return "";

    if (window.USE_API && _bhashiniReady()) {
      console.log("[Vaani API] translateWithAPI → Bhashini NMT [", sourceLang, "→", targetLang, "]");
      const result = await _bhashiniNMT(text, sourceLang, targetLang);
      if (result) return result;
      console.warn("[Vaani API] Bhashini NMT failed — falling back to existing translateText");
    }

    // Fallback: existing Vaani backend (defined in app.js global scope)
    if (typeof translateText === "function") {
      return translateText(text, sourceLang, targetLang);
    }
    if (typeof window.translateText === "function") {
      return window.translateText(text, sourceLang, targetLang);
    }

    console.error("[Vaani API] No fallback translateText found");
    return "";
  };

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC: apiServiceStatus (debug)
  // ══════════════════════════════════════════════════════════════════

  window.apiServiceStatus = function () {
    const status = {
      USE_API:            window.USE_API,
      bhashiniKeysSet:    !!(window.BHASHINI_API_KEY && window.BHASHINI_USER_ID && window.BHASHINI_INFERENCE_URL),
      bhashiniActive:     _bhashiniReady(),
      mediaRecorderReady: !!(window.MediaRecorder && navigator.mediaDevices?.getUserMedia),
      mode: _bhashiniReady()
        ? "Bhashini ASR + NMT (primary)"
        : window.USE_API
          ? "USE_API=true but Bhashini keys missing — using fallback"
          : "Existing system (USE_API=false)",
    };
    console.table(status);
    return status;
  };

  // ── HELPERS ───────────────────────────────────────────────────────

  function _blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ── Boot log ──────────────────────────────────────────────────────
  console.log(
    "[Vaani API] apiService v2 loaded |",
    "USE_API:", window.USE_API, "|",
    _bhashiniReady() ? "Bhashini ACTIVE ✓" : "Bhashini inactive (keys not set or USE_API=false)"
  );

})();
