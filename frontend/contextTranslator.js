/* ================================================================
   Vaani — contextTranslator.js  (global build — no import/export)
   Depends on: slangDictionary.js, toneDetector.js (must load first)
   All symbols attached to window. Load with plain <script> tag.
================================================================ */

var _CT_MIN_CONFIDENCE = 0.35;

var _CT_TONE_MARKERS = {
  "friendly":   { suffix: " bro",   prefix: "" },
  "casual":     { suffix: "",        prefix: "" },
  "angry":      { suffix: "!",       prefix: "" },
  "respectful": { suffix: "",        prefix: "Please " },
  "neutral":    { suffix: "",        prefix: "" },
};

// ── Phrase rewrite tables ─────────────────────────────────────────
var _CT_PHRASE_REWRITES = {
  te: [
    { triggers: ["enti ra","enti ri"],       rewrite: "what's up bro?",         confidence: 0.95 },
    { triggers: ["ra bey","ra bei"],         rewrite: "come on bro",             confidence: 0.92 },
    { triggers: ["em chestunnav"],           rewrite: "what are you doing bro?", confidence: 0.90 },
    { triggers: ["ela unnav","ela unnavu"],  rewrite: "how are you bro?",        confidence: 0.90 },
    { triggers: ["poru","poru ra"],          rewrite: "leave it bro",            confidence: 0.88 },
    { triggers: ["chala bagundi"],           rewrite: "that's really great!",    confidence: 0.85 },
    { triggers: ["abbaa"],                   rewrite: "oh wow!",                 confidence: 0.80 },
    { triggers: ["nayana"],                  rewrite: "dear",                    confidence: 0.75 },
    { triggers: ["babu"],                    rewrite: "buddy",                   confidence: 0.72 },
    { triggers: ["enti","emiti"],            rewrite: "what?",                   confidence: 0.65 },
    { triggers: ["ra"],                      rewrite: "bro",                     confidence: 0.60 },
    { triggers: ["bey","bei"],               rewrite: "dude",                    confidence: 0.60 },
    { triggers: ["chala"],                   rewrite: "really",                  confidence: 0.55 },
    { triggers: ["ayindi"],                  rewrite: "that's done",             confidence: 0.55 },
    { triggers: ["ledu"],                    rewrite: "there isn't any",         confidence: 0.50 },
    { triggers: ["jagratta"],                rewrite: "be careful!",             confidence: 0.70 },
    { triggers: ["tondara"],                 rewrite: "hurry up",                confidence: 0.70 },
    { triggers: ["ఏంటి రా"],               rewrite: "what's up bro?",          confidence: 0.95 },
    { triggers: ["రా"],                      rewrite: "bro",                     confidence: 0.60 },
  ],
  hi: [
    { triggers: ["kya scene hai","kya scene"],rewrite: "what's going on?",      confidence: 0.92 },
    { triggers: ["kya kar raha hai"],        rewrite: "what are you doing bro?", confidence: 0.90 },
    { triggers: ["kaise ho yaar"],           rewrite: "how are you bro?",        confidence: 0.90 },
    { triggers: ["chad yaar","chod yaar"],   rewrite: "forget it bro",           confidence: 0.88 },
    { triggers: ["arre yaar"],               rewrite: "oh come on bro",          confidence: 0.88 },
    { triggers: ["bindaas"],                 rewrite: "chill, it's cool",        confidence: 0.85 },
    { triggers: ["jugaad karo","jugaad"],    rewrite: "figure out a workaround", confidence: 0.82 },
    { triggers: ["dhamaal"],                 rewrite: "what a blast!",           confidence: 0.80 },
    { triggers: ["mast hai","mast"],         rewrite: "awesome!",                confidence: 0.78 },
    { triggers: ["bakwaas"],                 rewrite: "nonsense!",               confidence: 0.75 },
    { triggers: ["lafda"],                   rewrite: "there's trouble",         confidence: 0.72 },
    { triggers: ["timepass"],                rewrite: "just killing time",       confidence: 0.70 },
    { triggers: ["yaar"],                    rewrite: "bro",                     confidence: 0.60 },
    { triggers: ["bhai"],                    rewrite: "bro",                     confidence: 0.60 },
    { triggers: ["arre"],                    rewrite: "hey",                     confidence: 0.55 },
    { triggers: ["jaldi kar"],               rewrite: "hurry up!",               confidence: 0.75 },
    { triggers: ["यार"],                     rewrite: "bro",                     confidence: 0.60 },
    { triggers: ["भाई"],                     rewrite: "bro",                     confidence: 0.60 },
  ],
  ta: [
    { triggers: ["enna da solre","enna da"],rewrite: "what are you saying bro?", confidence: 0.92 },
    { triggers: ["epdi da iruka"],          rewrite: "how are you bro?",         confidence: 0.90 },
    { triggers: ["vera level"],             rewrite: "that's on another level!",  confidence: 0.90 },
    { triggers: ["semma da","semma"],       rewrite: "absolutely awesome!",       confidence: 0.88 },
    { triggers: ["poda da","poda"],         rewrite: "get out of here bro",       confidence: 0.85 },
    { triggers: ["super da","super"],       rewrite: "super bro!",                confidence: 0.83 },
    { triggers: ["enna da"],               rewrite: "what bro?",                 confidence: 0.80 },
    { triggers: ["paathukko"],             rewrite: "take care!",                confidence: 0.78 },
    { triggers: ["machan"],                rewrite: "bro",                       confidence: 0.65 },
    { triggers: ["da"],                    rewrite: "bro",                       confidence: 0.55 },
    { triggers: ["dei"],                   rewrite: "dude",                      confidence: 0.58 },
    { triggers: ["aama"],                  rewrite: "yeah",                      confidence: 0.50 },
    { triggers: ["illa"],                  rewrite: "nope",                      confidence: 0.50 },
    { triggers: ["மச்சான்"],               rewrite: "bro",                       confidence: 0.65 },
    { triggers: ["டா"],                    rewrite: "bro",                       confidence: 0.55 },
  ],
  kn: [
    { triggers: ["yen guru","yen maadle"], rewrite: "what's up bro?",           confidence: 0.92 },
    { triggers: ["hengide guru"],          rewrite: "how are you bro?",          confidence: 0.90 },
    { triggers: ["onde kathe guru"],       rewrite: "same old story bro",        confidence: 0.88 },
    { triggers: ["hogbidi","hogbeku"],     rewrite: "just leave it",             confidence: 0.85 },
    { triggers: ["sahi haelu","sahi"],     rewrite: "that's right!",             confidence: 0.78 },
    { triggers: ["sullu"],                 rewrite: "that's a lie!",             confidence: 0.75 },
    { triggers: ["bega"],                  rewrite: "quickly!",                  confidence: 0.70 },
    { triggers: ["guru"],                  rewrite: "bro",                       confidence: 0.65 },
    { triggers: ["machaa"],                rewrite: "bro",                       confidence: 0.65 },
    { triggers: ["bekilla"],               rewrite: "no need",                   confidence: 0.60 },
    { triggers: ["ಗುರು"],                  rewrite: "bro",                       confidence: 0.65 },
  ],
  ml: [
    { triggers: ["enthu cheyva da"],       rewrite: "what are you doing bro?",  confidence: 0.92 },
    { triggers: ["adipoli da","adipoli"],  rewrite: "that's awesome bro!",       confidence: 0.90 },
    { triggers: ["enthu parayva","enthu"],rewrite: "what are you saying?",       confidence: 0.85 },
    { triggers: ["poda da","poda"],        rewrite: "get lost bro",              confidence: 0.83 },
    { triggers: ["sheri da","sheri"],      rewrite: "okay bro",                  confidence: 0.80 },
    { triggers: ["thalleda"],              rewrite: "that's not true!",          confidence: 0.78 },
    { triggers: ["mone"],                  rewrite: "dear",                      confidence: 0.65 },
    { triggers: ["mol"],                   rewrite: "dear",                      confidence: 0.65 },
    { triggers: ["chetta"],                rewrite: "bro",                       confidence: 0.65 },
    { triggers: ["machaan"],               rewrite: "bro",                       confidence: 0.65 },
    { triggers: ["മോനേ"],                  rewrite: "dear",                      confidence: 0.65 },
  ],
  bn: [
    { triggers: ["ki korcho re"],          rewrite: "what are you doing bro?",  confidence: 0.92 },
    { triggers: ["kemon acho re"],         rewrite: "how are you bro?",          confidence: 0.90 },
    { triggers: ["jhol ache","jhol"],      rewrite: "there's a mess",            confidence: 0.85 },
    { triggers: ["pagol na ki"],           rewrite: "are you crazy?",            confidence: 0.83 },
    { triggers: ["thik ache","thik"],      rewrite: "it's alright",              confidence: 0.68 },
    { triggers: ["bhai"],                  rewrite: "bro",                       confidence: 0.60 },
    { triggers: ["dada"],                  rewrite: "bro",                       confidence: 0.60 },
    { triggers: ["ভাই"],                   rewrite: "bro",                       confidence: 0.60 },
  ],
  mr: [
    { triggers: ["kay karto re"],          rewrite: "what are you doing bro?",  confidence: 0.92 },
    { triggers: ["kasa ahe re"],           rewrite: "how are you bro?",          confidence: 0.90 },
    { triggers: ["bhaari ahe","bhaari"],   rewrite: "that's awesome!",           confidence: 0.88 },
    { triggers: ["ghanta"],                rewrite: "absolutely nothing!",       confidence: 0.85 },
    { triggers: ["fokat"],                 rewrite: "for free",                  confidence: 0.80 },
    { triggers: ["kharach"],               rewrite: "for real?",                 confidence: 0.75 },
    { triggers: ["chaan"],                 rewrite: "nice!",                     confidence: 0.70 },
    { triggers: ["bhau"],                  rewrite: "bro",                       confidence: 0.65 },
    { triggers: ["भाऊ"],                   rewrite: "bro",                       confidence: 0.65 },
  ],
  gu: [
    { triggers: ["kem cho yaar","kem cho"],rewrite: "how are you bro?",         confidence: 0.92 },
    { triggers: ["mast che","mast"],       rewrite: "that's awesome!",           confidence: 0.85 },
    { triggers: ["dhama"],                 rewrite: "what a party!",             confidence: 0.80 },
    { triggers: ["gando"],                 rewrite: "you're crazy!",             confidence: 0.78 },
    { triggers: ["bhai"],                  rewrite: "bro",                       confidence: 0.60 },
    { triggers: ["yaar"],                  rewrite: "bro",                       confidence: 0.60 },
  ],
  pa: [
    { triggers: ["kiddan yaar","kiddan"],  rewrite: "what's up bro?",           confidence: 0.92 },
    { triggers: ["ki haal yaar"],          rewrite: "how are you bro?",          confidence: 0.90 },
    { triggers: ["chad yaar"],             rewrite: "leave it bro",              confidence: 0.88 },
    { triggers: ["oye"],                   rewrite: "hey",                       confidence: 0.68 },
    { triggers: ["paaji"],                 rewrite: "bro",                       confidence: 0.65 },
    { triggers: ["yaar"],                  rewrite: "bro",                       confidence: 0.60 },
    { triggers: ["ਯਾਰ"],                   rewrite: "bro",                       confidence: 0.60 },
  ],
  ur: [
    { triggers: ["kya scene yaar"],        rewrite: "what's going on bro?",     confidence: 0.92 },
    { triggers: ["zabardast"],             rewrite: "that's incredible!",        confidence: 0.88 },
    { triggers: ["bakwaas"],               rewrite: "nonsense!",                 confidence: 0.80 },
    { triggers: ["mast"],                  rewrite: "awesome!",                  confidence: 0.75 },
    { triggers: ["yaar"],                  rewrite: "bro",                       confidence: 0.60 },
    { triggers: ["bhai"],                  rewrite: "bro",                       confidence: 0.60 },
    { triggers: ["jaan"],                  rewrite: "dear",                      confidence: 0.65 },
  ],
  or: [
    { triggers: ["ki khobor re","ki khobor"], rewrite: "what's up bro?",        confidence: 0.90 },
    { triggers: ["bhai"],                  rewrite: "bro",                       confidence: 0.60 },
  ],
  as: [
    { triggers: ["ki khobor re","ki khobor"], rewrite: "what's up bro?",        confidence: 0.90 },
    { triggers: ["jordar"],                rewrite: "that's powerful!",          confidence: 0.82 },
    { triggers: ["bhai"],                  rewrite: "bro",                       confidence: 0.60 },
  ],
  ne: [
    { triggers: ["ke cha dai","ke cha"],   rewrite: "what's up bro?",           confidence: 0.92 },
    { triggers: ["chatpat"],               rewrite: "quickly!",                  confidence: 0.78 },
    { triggers: ["jhyaure"],               rewrite: "you slowpoke",              confidence: 0.75 },
    { triggers: ["dai"],                   rewrite: "bro",                       confidence: 0.65 },
    { triggers: ["sathi"],                 rewrite: "buddy",                     confidence: 0.62 },
  ],
  bho: [
    { triggers: ["ka ba yaar","ka ba"],    rewrite: "what's up bro?",           confidence: 0.90 },
    { triggers: ["baa"],                   rewrite: "yeah",                      confidence: 0.65 },
    { triggers: ["bhaiya"],                rewrite: "bro",                       confidence: 0.65 },
  ],
  bgc: [
    { triggers: ["ke hoga yaar"],          rewrite: "what happened bro?",       confidence: 0.88 },
    { triggers: ["bhai"],                  rewrite: "bro",                       confidence: 0.60 },
  ],
  raj: [
    { triggers: ["kem cho yaar"],          rewrite: "how are you bro?",         confidence: 0.88 },
    { triggers: ["sa"],                    rewrite: "sir",                       confidence: 0.58 },
  ],
  _common: [
    { triggers: ["come here!","come here now","get here"], rewrite: "get over here!",           confidence: 0.70 },
    { triggers: ["what are you doing?"],   rewrite: "what are you up to?",       confidence: 0.65 },
    { triggers: ["how are you?"],          rewrite: "how are you doing?",        confidence: 0.60 },
    { triggers: ["okay okay","ok ok"],     rewrite: "alright, alright",          confidence: 0.65 },
    { triggers: ["very good","very nice"], rewrite: "really great!",             confidence: 0.60 },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────

function _ctNorm(text) {
  return String(text || "").toLowerCase().trim();
}

function _ctMatchesTrigger(normOrig, triggers) {
  for (var i = 0; i < triggers.length; i++) {
    if (normOrig.indexOf(_ctNorm(triggers[i])) !== -1) return true;
  }
  return false;
}

function _ctFindBestRewrite(normOrig, lang) {
  var best = null;
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
  var dict  = window.getSlangForLang(lang);
  var hits  = [];
  normOrig.split(/\s+/).forEach(function(word) {
    var entry = dict[word];
    if (entry) hits.push({ slang: word, meaning: entry.meaning, tone: entry.tone });
  });
  return hits;
}

function _ctApplyToneMarker(translated, tone) {
  var marker = _CT_TONE_MARKERS[tone] || _CT_TONE_MARKERS["neutral"];
  var result = String(translated || "").trim();
  if (!result) return result;

  if (marker.prefix && result.toLowerCase().indexOf(marker.prefix.trim().toLowerCase()) !== 0) {
    result = marker.prefix + result;
  }

  if (marker.suffix) {
    var sfx = marker.suffix.trim();
    if (sfx && result.toLowerCase().slice(-sfx.length) !== sfx.toLowerCase()) {
      var hasSocial = /\b(bro|dude|man|buddy|pal|dear|sir|madam)\b/i.test(result);
      if (!(sfx === "bro" && hasSocial)) {
        var termMatch = result.match(/([!?.,…]+)$/);
        if (termMatch) {
          result = result.slice(0, -termMatch[1].length) + " " + sfx + termMatch[1];
        } else {
          result = result + " " + sfx;
        }
      }
    }
  }
  return result;
}

function _ctCapFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Main exports ──────────────────────────────────────────────────

window.enhanceTranslation = function(original, translated, lang) {
  try {
    if (!original || typeof original !== "string") return translated || "";
    if (!translated || typeof translated !== "string") return translated || "";

    var normOrig  = _ctNorm(original);
    var normTrans = _ctNorm(translated);

    // Skip single-word pass-throughs
    if (normTrans.split(/\s+/).length === 1 && normOrig.split(/\s+/).length === 1) return translated;

    var tone    = (typeof window.detectTone === "function") ? window.detectTone(original, lang) : "neutral";
    var rewrite = _ctFindBestRewrite(normOrig, lang);

    if (rewrite && rewrite.confidence >= _CT_MIN_CONFIDENCE) {
      return _ctCapFirst(_ctApplyToneMarker(rewrite.rewrite, tone));
    }

    var slangHits = _ctFindSlangHits(normOrig, lang);
    var enhanced  = translated;

    if (slangHits.length > 0) {
      var LITERAL_MAP = {
        "bro": ["bro","brother","man"], "friend": ["friend","buddy"],
        "dude": ["dude","man","guy"],   "dear": ["dear","darling","honey"],
        "money": ["money","cash"],      "quickly": ["quickly","fast","hurry"],
        "nonsense": ["nonsense","rubbish"], "awesome": ["awesome","great","wonderful"],
      };

      slangHits.forEach(function(hit) {
        var naturalMeaning = hit.meaning.split(" / ")[0].trim().toLowerCase();
        var equivalents    = LITERAL_MAP[naturalMeaning] || [naturalMeaning];
        var normEnh        = _ctNorm(enhanced);
        var alreadyNatural = equivalents.some(function(eq) { return normEnh.indexOf(eq) !== -1; });
        if (!alreadyNatural) {
          enhanced = enhanced.trim();
          var hasPunct = /[!?.,…]$/.test(enhanced);
          if (hasPunct) {
            enhanced = enhanced.slice(0, -1) + " " + naturalMeaning + enhanced.slice(-1);
          } else {
            enhanced += " " + naturalMeaning;
          }
        }
      });
    }

    if (tone !== "neutral") enhanced = _ctApplyToneMarker(enhanced, tone);

    if (!enhanced || enhanced.length > translated.length * 1.4) return _ctCapFirst(translated.trim());

    return _ctCapFirst(enhanced.trim());
  } catch (e) {
    return translated || "";
  }
};

window.enhanceTranslationDetailed = function(original, translated, lang) {
  try {
    var normOrig  = _ctNorm(original || "");
    var tone      = (typeof window.detectTone === "function") ? window.detectTone(original || "", lang) : "neutral";
    var rewrite   = _ctFindBestRewrite(normOrig, lang);
    var slangHits = _ctFindSlangHits(normOrig, lang);
    var enhanced  = window.enhanceTranslation(original, translated, lang);
    return {
      enhanced:    enhanced,
      original:    original,
      translated:  translated,
      tone:        tone,
      slangHits:   slangHits,
      rewriteUsed: !!(rewrite && rewrite.confidence >= _CT_MIN_CONFIDENCE),
      confidence:  rewrite ? rewrite.confidence : 0,
    };
  } catch (e) {
    return { enhanced: translated || "", original: original, translated: translated,
             tone: "neutral", slangHits: [], rewriteUsed: false, confidence: 0 };
  }
};
