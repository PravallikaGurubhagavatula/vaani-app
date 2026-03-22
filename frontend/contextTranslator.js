/* ================================================================
   Vaani — contextTranslator.js  v2.0  (global build — no import/export)
   Depends on: slangDictionary.js, toneDetector.js (must load first)
   All symbols attached to window. Load with plain <script> tag.

   WHAT THIS FILE DOES:
   ─────────────────────────────────────────────────────────────────
   1. Detects SENTENCE TYPE  : question / command / statement
   2. Detects TONE           : friendly / angry / neutral / respectful / casual
   3. Applies ENHANCEMENT    : only for short phrases, never full sentence override
   4. Exports to window      :
        enhanceTranslation(original, translated, lang) → string
        enhanceTranslationDetailed(...)                → detail object
        detectSentenceType(text)                       → "question"|"command"|"statement"

   RULES (hard):
   ─────────────────────────────────────────────────────────────────
   - NEVER override a sentence with > 4 words (rewrite guard)
   - NEVER inject slang into sentences > 3 words
   - NEVER apply slang when tone is angry
   - NEVER add " bro" suffix to commands (commands = orders, not greetings)
   - NEVER change question mark behaviour (questions stay as questions)
   - ONLY enhance tone — never change core meaning
================================================================ */

// ── CONFIG ────────────────────────────────────────────────────────
var _CT_MIN_CONFIDENCE = 0.35;

// ── SENTENCE TYPE → TONE MARKER MATRIX ───────────────────────────
// Defines what markers are safe to add per (tone × sentence type).
// Empty string = no marker added.
var _CT_TONE_MARKERS = {
  //           question    command     statement
  friendly:  { question: "",   command: "",   statement: " bro"  },
  casual:    { question: "",   command: "",   statement: ""       },
  angry:     { question: "!",  command: "!!", statement: "!"      },
  respectful:{ question: "",   command: "",   statement: ""       },
  neutral:   { question: "",   command: "",   statement: ""       },
};

// ── PHRASE REWRITE TABLES ─────────────────────────────────────────
// Only applied for short inputs (≤ 4 words).
// Triggers use whole-word matching for single words (see _ctMatchesTrigger).
var _CT_PHRASE_REWRITES = {
  te: [
    { triggers: ["enti ra","enti ri"],      rewrite: "what's up bro?",          confidence: 0.95 },
    { triggers: ["ra bey","ra bei"],        rewrite: "come on bro",              confidence: 0.92 },
    { triggers: ["em chestunnav"],          rewrite: "what are you doing bro?",  confidence: 0.90 },
    { triggers: ["ela unnav","ela unnavu"], rewrite: "how are you bro?",         confidence: 0.90 },
    { triggers: ["poru","poru ra"],         rewrite: "leave it bro",             confidence: 0.88 },
    { triggers: ["chala bagundi"],          rewrite: "that's really great!",     confidence: 0.85 },
    { triggers: ["abbaa"],                  rewrite: "oh wow!",                  confidence: 0.80 },
    { triggers: ["nayana"],                 rewrite: "dear",                     confidence: 0.75 },
    { triggers: ["babu"],                   rewrite: "buddy",                    confidence: 0.72 },
    { triggers: ["enti","emiti"],           rewrite: "what?",                    confidence: 0.65 },
    { triggers: ["bey","bei"],              rewrite: "dude",                     confidence: 0.60 },
    { triggers: ["chala"],                  rewrite: "really",                   confidence: 0.55 },
    { triggers: ["ayindi"],                 rewrite: "that's done",              confidence: 0.55 },
    { triggers: ["ledu"],                   rewrite: "there isn't any",          confidence: 0.50 },
    { triggers: ["jagratta"],               rewrite: "be careful!",              confidence: 0.70 },
    { triggers: ["tondara"],                rewrite: "hurry up",                 confidence: 0.70 },
    { triggers: ["ఏంటి రా"],              rewrite: "what's up bro?",           confidence: 0.95 },
    // NOTE: single-word "ra" and "రా" intentionally removed from rewrites —
    // they are handled only as slang hits when the sentence is ≤ 3 words.
  ],
  hi: [
    { triggers: ["kya scene hai","kya scene"], rewrite: "what's going on?",     confidence: 0.92 },
    { triggers: ["kya kar raha hai"],        rewrite: "what are you doing bro?", confidence: 0.90 },
    { triggers: ["kaise ho yaar"],           rewrite: "how are you bro?",        confidence: 0.90 },
    { triggers: ["chad yaar","chod yaar"],   rewrite: "forget it bro",           confidence: 0.88 },
    { triggers: ["arre yaar"],               rewrite: "oh come on bro",          confidence: 0.88 },
    { triggers: ["bindaas"],                 rewrite: "chill, it's cool",        confidence: 0.85 },
    { triggers: ["jugaad karo","jugaad"],    rewrite: "figure out a workaround", confidence: 0.82 },
    { triggers: ["dhamaal"],                 rewrite: "what a blast!",            confidence: 0.80 },
    { triggers: ["mast hai","mast"],         rewrite: "awesome!",                confidence: 0.78 },
    { triggers: ["bakwaas"],                 rewrite: "nonsense!",               confidence: 0.75 },
    { triggers: ["lafda"],                   rewrite: "there's trouble",         confidence: 0.72 },
    { triggers: ["timepass"],               rewrite: "just killing time",        confidence: 0.70 },
    { triggers: ["jaldi kar"],              rewrite: "hurry up!",                confidence: 0.75 },
    { triggers: ["यार"],                    rewrite: "bro",                      confidence: 0.60 },
    { triggers: ["भाई"],                    rewrite: "bro",                      confidence: 0.60 },
  ],
  ta: [
    { triggers: ["enna da solre","enna da"], rewrite: "what are you saying bro?", confidence: 0.92 },
    { triggers: ["epdi da iruka"],           rewrite: "how are you bro?",          confidence: 0.90 },
    { triggers: ["vera level"],              rewrite: "that's on another level!",  confidence: 0.90 },
    { triggers: ["semma da","semma"],        rewrite: "absolutely awesome!",       confidence: 0.88 },
    { triggers: ["poda da"],                 rewrite: "get out of here bro",       confidence: 0.85 },
    { triggers: ["super da","super"],        rewrite: "super bro!",                confidence: 0.83 },
    { triggers: ["paathukko"],               rewrite: "take care!",                confidence: 0.78 },
    { triggers: ["மச்சான்"],                rewrite: "bro",                        confidence: 0.65 },
  ],
  kn: [
    { triggers: ["yen guru","yen maadle"],   rewrite: "what's up bro?",           confidence: 0.92 },
    { triggers: ["hengide guru"],            rewrite: "how are you bro?",          confidence: 0.90 },
    { triggers: ["onde kathe guru"],         rewrite: "same old story bro",        confidence: 0.88 },
    { triggers: ["hogbidi","hogbeku"],       rewrite: "just leave it",             confidence: 0.85 },
    { triggers: ["sahi haelu","sahi"],       rewrite: "that's right!",             confidence: 0.78 },
    { triggers: ["sullu"],                   rewrite: "that's a lie!",             confidence: 0.75 },
    { triggers: ["bega"],                    rewrite: "quickly!",                  confidence: 0.70 },
    { triggers: ["ಗುರು"],                   rewrite: "bro",                        confidence: 0.65 },
  ],
  ml: [
    { triggers: ["enthu cheyva da"],         rewrite: "what are you doing bro?",  confidence: 0.92 },
    { triggers: ["adipoli da","adipoli"],    rewrite: "that's awesome bro!",       confidence: 0.90 },
    { triggers: ["enthu parayva"],           rewrite: "what are you saying?",      confidence: 0.85 },
    { triggers: ["poda da"],                 rewrite: "get lost bro",              confidence: 0.83 },
    { triggers: ["sheri da","sheri"],        rewrite: "okay bro",                  confidence: 0.80 },
    { triggers: ["thalleda"],               rewrite: "that's not true!",           confidence: 0.78 },
    { triggers: ["മോനേ"],                   rewrite: "dear",                       confidence: 0.65 },
  ],
  bn: [
    { triggers: ["ki korcho re"],            rewrite: "what are you doing bro?",  confidence: 0.92 },
    { triggers: ["kemon acho re"],           rewrite: "how are you bro?",          confidence: 0.90 },
    { triggers: ["jhol ache","jhol"],        rewrite: "there's a mess",            confidence: 0.85 },
    { triggers: ["pagol na ki"],             rewrite: "are you crazy?",            confidence: 0.83 },
    { triggers: ["thik ache","thik"],        rewrite: "it's alright",              confidence: 0.68 },
    { triggers: ["ভাই"],                    rewrite: "bro",                        confidence: 0.60 },
  ],
  mr: [
    { triggers: ["kay karto re"],            rewrite: "what are you doing bro?",  confidence: 0.92 },
    { triggers: ["kasa ahe re"],             rewrite: "how are you bro?",          confidence: 0.90 },
    { triggers: ["bhaari ahe","bhaari"],     rewrite: "that's awesome!",           confidence: 0.88 },
    { triggers: ["ghanta"],                  rewrite: "absolutely nothing!",       confidence: 0.85 },
    { triggers: ["kharach"],                 rewrite: "for real?",                 confidence: 0.75 },
    { triggers: ["chaan"],                   rewrite: "nice!",                     confidence: 0.70 },
    { triggers: ["भाऊ"],                    rewrite: "bro",                        confidence: 0.65 },
  ],
  gu: [
    { triggers: ["kem cho yaar","kem cho"],  rewrite: "how are you bro?",         confidence: 0.92 },
    { triggers: ["mast che","mast"],         rewrite: "that's awesome!",           confidence: 0.85 },
    { triggers: ["dhama"],                   rewrite: "what a party!",             confidence: 0.80 },
    { triggers: ["gando"],                   rewrite: "you're crazy!",             confidence: 0.78 },
  ],
  pa: [
    { triggers: ["kiddan yaar","kiddan"],    rewrite: "what's up bro?",           confidence: 0.92 },
    { triggers: ["ki haal yaar"],            rewrite: "how are you bro?",          confidence: 0.90 },
    { triggers: ["chad yaar"],               rewrite: "leave it bro",              confidence: 0.88 },
    { triggers: ["ਯਾਰ"],                    rewrite: "bro",                        confidence: 0.60 },
  ],
  ur: [
    { triggers: ["kya scene yaar"],          rewrite: "what's going on bro?",     confidence: 0.92 },
    { triggers: ["zabardast"],               rewrite: "that's incredible!",        confidence: 0.88 },
    { triggers: ["bakwaas"],                 rewrite: "nonsense!",                 confidence: 0.80 },
    { triggers: ["mast"],                    rewrite: "awesome!",                  confidence: 0.75 },
  ],
  or: [
    { triggers: ["ki khobor re","ki khobor"], rewrite: "what's up bro?",          confidence: 0.90 },
  ],
  as: [
    { triggers: ["ki khobor re","ki khobor"], rewrite: "what's up bro?",          confidence: 0.90 },
    { triggers: ["jordar"],                   rewrite: "that's powerful!",         confidence: 0.82 },
  ],
  ne: [
    { triggers: ["ke cha dai","ke cha"],      rewrite: "what's up bro?",          confidence: 0.92 },
    { triggers: ["chatpat"],                  rewrite: "quickly!",                 confidence: 0.78 },
  ],
  bho: [
    { triggers: ["ka ba yaar","ka ba"],       rewrite: "what's up bro?",          confidence: 0.90 },
  ],
  bgc: [
    { triggers: ["ke hoga yaar"],             rewrite: "what happened bro?",      confidence: 0.88 },
  ],
  raj: [
    { triggers: ["kem cho yaar"],             rewrite: "how are you bro?",        confidence: 0.88 },
  ],
  _common: [
    { triggers: ["what are you doing?"],      rewrite: "what are you up to?",     confidence: 0.65 },
    { triggers: ["how are you?"],             rewrite: "how are you doing?",       confidence: 0.60 },
    { triggers: ["okay okay","ok ok"],        rewrite: "alright, alright",         confidence: 0.65 },
    { triggers: ["very good","very nice"],    rewrite: "really great!",            confidence: 0.60 },
  ],
};

// ══════════════════════════════════════════════════════════════════
// SENTENCE TYPE DETECTION
// ══════════════════════════════════════════════════════════════════

/**
 * Classifies a text into one of three sentence types.
 * This is language-agnostic — uses surface signals only.
 *
 * question  : ends with ? | contains question words | is interrogative
 * command   : imperative structure | ends with ! | starts with action verb
 * statement : everything else
 */
window.detectSentenceType = function(text) {
  if (!text || typeof text !== "string") return "statement";
  var t = text.trim();
  if (!t) return "statement";

  // ── Signal 1: explicit question mark ──
  if (/\?/.test(t)) return "question";

  var lower = t.toLowerCase();

  // ── Signal 2: question words (cross-language common romanisations + English) ──
  var questionStarters = [
    // English
    /^(what|who|where|when|why|how|which|whose|whom|is it|are you|do you|did you|will you|can you|could you|have you|has|does)\b/i,
    // Telugu romanised
    /^(enti|emiti|ela|evaru|enduku|ekkada|epudu|emi)\b/i,
    // Hindi romanised
    /^(kya|kaun|kahan|kab|kyun|kaise|kitna|kidhar)\b/i,
    // Tamil romanised
    /^(enna|yenna|yaar|epdi|enga|yen|eppadi)\b/i,
    // Kannada romanised
    /^(yen|yenu|yaaru|yelli|hege|hengide)\b/i,
    // Malayalam romanised
    /^(enthu|aaru|evide|eppo|enthu|engane)\b/i,
  ];
  for (var qi = 0; qi < questionStarters.length; qi++) {
    if (questionStarters[qi].test(lower)) return "question";
  }

  // ── Signal 3: command / imperative ──
  // Multiple exclamation marks are a strong command signal.
  if (/!{2,}/.test(t)) return "command";

  // Short ALL-CAPS words signal shouted commands
  if (/\b[A-Z]{3,}\b/.test(t)) return "command";

  // Common command starters in English
  var commandStarters = /^(stop|come|go|sit|stand|wait|listen|look|give|take|bring|put|get|let|don't|do not|be quiet|shut|open|close|run|stay|help|call|tell|show|leave|move|keep|make|use|try|please\s+\w+|don't\s+\w+)\b/i;
  if (commandStarters.test(lower)) return "command";

  // Indian language command signals (ends with imperative particles)
  // Telugu: ra, bey, bei (but only if short), chuso, vello
  // Hindi: jao, ao, bolo, suno, karo, ruko, chup
  // Tamil: poda, vaa, po, iru, sollu
  var commandEndings = /\b(jao|jaao|ruko|bolo|suno|karo|chup|poda|vaa|velli|chuso|bey|bei|ra|sollo|sollu)\s*[!]?$/i;
  if (commandEndings.test(lower) && lower.split(/\s+/).length <= 5) return "command";

  return "statement";
};

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

function _ctNorm(text) {
  return String(text || "").toLowerCase().trim();
}

function _ctMatchesTrigger(normOrig, triggers) {
  for (var i = 0; i < triggers.length; i++) {
    var t = _ctNorm(triggers[i]);
    if (t.indexOf(" ") !== -1) {
      // Multi-word: substring match (specific enough)
      if (normOrig.indexOf(t) !== -1) return true;
    } else {
      // Single-word: require whole-word match to prevent "ra" → "bro"
      // matching inside "nuvvu patalu rasava" etc.
      var re = new RegExp(
        "(?:^|\\s)" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\s|$|[!?.,])"
      );
      if (re.test(normOrig)) return true;
    }
  }
  return false;
}

function _ctFindBestRewrite(normOrig, lang) {
  var best   = null;
  var tables = (_CT_PHRASE_REWRITES[lang] || []).concat(_CT_PHRASE_REWRITES._common || []);
  tables.forEach(function(entry) {
    if (_ctMatchesTrigger(normOrig, entry.triggers)) {
      if (!best || entry.confidence > best.confidence) best = entry;
    }
  });
  return best;
}

function _ctFindSlangHits(normOrig, lang) {
  if (typeof window.getSlangForLang !== "function") return [];
  var dict = window.getSlangForLang(lang);
  var hits = [];
  normOrig.split(/\s+/).forEach(function(word) {
    var entry = dict[word];
    if (entry) hits.push({ slang: word, meaning: entry.meaning, tone: entry.tone });
  });
  return hits;
}

/**
 * Apply a tone suffix/prefix to the translated string.
 * Respects sentence type:
 *   - commands:  never add " bro" (would sound wrong: "Be quiet!! bro")
 *   - questions: preserve the "?" at end — never cut it
 *   - angry:     strengthen exclamation marks if missing
 */
function _ctApplyToneMarker(translated, tone, sentenceType) {
  var stype  = sentenceType || "statement";
  var result = String(translated || "").trim();
  if (!result) return result;

  var markerRow = _CT_TONE_MARKERS[tone] || _CT_TONE_MARKERS["neutral"];
  var sfx       = (markerRow[stype] || "").trim();

  // Angry tone: ensure at least one ! for commands/statements
  if (tone === "angry") {
    var hasBang = /!/.test(result);
    if (!hasBang) {
      var termMatch = result.match(/([?.,…]+)$/);
      if (termMatch) {
        result = result.slice(0, -termMatch[1].length) + "!" + termMatch[1];
      } else {
        result = result + "!";
      }
    }
    return result;
  }

  // For "bro" suffix: only add to statements, only if not already present
  if (sfx === " bro" || sfx === "bro") {
    if (stype !== "statement") return result;  // never on questions/commands
    var hasSocial = /\b(bro|dude|man|buddy|pal|dear|sir|madam|yaar|friend)\b/i.test(result);
    if (hasSocial) return result;
    // Insert before terminal punctuation
    var termPunct = result.match(/([!?.,…]+)$/);
    if (termPunct) {
      return result.slice(0, -termPunct[1].length) + " bro" + termPunct[1];
    }
    return result + " bro";
  }

  return result;
}

function _ctCapFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ══════════════════════════════════════════════════════════════════
// MAIN EXPORTS
// ══════════════════════════════════════════════════════════════════

/**
 * enhanceTranslation(original, translated, lang) → string
 *
 * Smart enhancement pipeline:
 * 1. Detect sentence type (question / command / statement)
 * 2. Detect tone (friendly / angry / neutral / respectful / casual)
 * 3. Apply phrase rewrite if short input + high confidence
 * 4. Inject slang meaning if very short + not angry
 * 5. Apply tone marker respecting sentence type
 *
 * HARD RULES enforced:
 * - No rewrite for > 4 words
 * - No slang injection for > 3 words or angry tone
 * - No " bro" on commands or questions
 * - No override of full sentences
 */
window.enhanceTranslation = function(original, translated, lang) {
  try {
    if (!original   || typeof original   !== "string") return translated || "";
    if (!translated || typeof translated !== "string") return translated || "";

    var normOrig  = _ctNorm(original);
    var normTrans = _ctNorm(translated);
    var wordCount = normOrig.split(/\s+/).filter(Boolean).length;

    // Skip trivial single-word pass-throughs
    if (normTrans.split(/\s+/).length === 1 && wordCount === 1) return translated;

    // Detect sentence type and tone
    var sentenceType = window.detectSentenceType(original);
    var tone         = (typeof window.detectTone === "function")
                       ? window.detectTone(original, lang)
                       : "neutral";

    // ── RULE: angry commands → return translation as-is (no softening) ──
    // "chup!!" → "be quiet!!" — already correct, don't touch it
    if (tone === "angry" && sentenceType === "command") {
      // Only strengthen existing ! if needed
      var hasExclaim = /!/.test(translated);
      return _ctCapFirst(hasExclaim ? translated.trim() : translated.trim() + "!");
    }

    // ── RULE: respectful sentences → return translation as-is ──
    // "please help me" → "please help me" (unchanged)
    if (tone === "respectful") {
      return _ctCapFirst(translated.trim());
    }

    // ── PHRASE REWRITE (≤ 4 words only) ──────────────────────────
    var rewrite = null;
    if (wordCount <= 4) {
      rewrite = _ctFindBestRewrite(normOrig, lang);
    }
    if (rewrite && rewrite.confidence >= _CT_MIN_CONFIDENCE) {
      // Apply tone marker to rewrite (respects sentence type)
      return _ctCapFirst(_ctApplyToneMarker(rewrite.rewrite, tone, sentenceType));
    }

    // ── SLANG INJECTION (≤ 3 words, not angry, not command) ──────
    var slangHits = [];
    if (wordCount <= 3 && tone !== "angry" && sentenceType !== "command") {
      slangHits = _ctFindSlangHits(normOrig, lang);
    }
    var enhanced = translated;

    if (slangHits.length > 0) {
      var LITERAL_MAP = {
        "bro":       ["bro","brother","man"],
        "friend":    ["friend","buddy","mate"],
        "dude":      ["dude","man","guy"],
        "dear":      ["dear","darling","honey"],
        "money":     ["money","cash"],
        "quickly":   ["quickly","fast","hurry"],
        "nonsense":  ["nonsense","rubbish"],
        "awesome":   ["awesome","great","wonderful"],
      };
      slangHits.forEach(function(hit) {
        var naturalMeaning = hit.meaning.split(" / ")[0].trim().toLowerCase();
        var equivalents    = LITERAL_MAP[naturalMeaning] || [naturalMeaning];
        var normEnh        = _ctNorm(enhanced);
        var alreadyPresent = equivalents.some(function(eq) { return normEnh.indexOf(eq) !== -1; });
        if (!alreadyPresent) {
          enhanced = enhanced.trim();
          var hasPunct = /[!?.,…]$/.test(enhanced);
          enhanced = hasPunct
            ? enhanced.slice(0, -1) + " " + naturalMeaning + enhanced.slice(-1)
            : enhanced + " " + naturalMeaning;
        }
      });
    }

    // ── TONE MARKER (statements + questions only) ─────────────────
    // Angry and respectful are handled above. Friendly adds " bro" on statements.
    if (tone === "friendly" || tone === "angry") {
      enhanced = _ctApplyToneMarker(enhanced, tone, sentenceType);
    }

    // Safety: reject if enhanced became much longer than original translation
    if (!enhanced || enhanced.length > translated.length * 1.5) {
      return _ctCapFirst(translated.trim());
    }

    return _ctCapFirst(enhanced.trim());
  } catch (e) {
    console.warn("[Vaani CT] enhanceTranslation error:", e && e.message);
    return translated || "";
  }
};

/**
 * enhanceTranslationDetailed(original, translated, lang) → object
 *
 * Same as enhanceTranslation but returns full debug info.
 * Used by translationIntegration.js for debug logging.
 */
window.enhanceTranslationDetailed = function(original, translated, lang) {
  try {
    var normOrig     = _ctNorm(original || "");
    var wordCount    = normOrig.split(/\s+/).filter(Boolean).length;
    var sentenceType = window.detectSentenceType(original || "");
    var tone         = (typeof window.detectTone === "function")
                       ? window.detectTone(original || "", lang)
                       : "neutral";
    var rewrite      = (wordCount <= 4) ? _ctFindBestRewrite(normOrig, lang) : null;
    var slangHits    = (wordCount <= 3 && tone !== "angry" && sentenceType !== "command")
                       ? _ctFindSlangHits(normOrig, lang)
                       : [];
    var enhanced     = window.enhanceTranslation(original, translated, lang);

    return {
      enhanced:     enhanced,
      original:     original,
      translated:   translated,
      tone:         tone,
      sentenceType: sentenceType,
      slangHits:    slangHits,
      rewriteUsed:  !!(rewrite && rewrite.confidence >= _CT_MIN_CONFIDENCE),
      confidence:   rewrite ? rewrite.confidence : 0,
    };
  } catch (e) {
    return {
      enhanced:     translated || "",
      original:     original,
      translated:   translated,
      tone:         "neutral",
      sentenceType: "statement",
      slangHits:    [],
      rewriteUsed:  false,
      confidence:   0,
    };
  }
};
