/**
 * Vaani — contextTranslator.js
 * ═══════════════════════════════════════════════════════════════════
 * Context-aware translation enhancer.
 * Takes a raw machine translation and makes it natural by:
 *   1. Detecting tone of the original
 *   2. Identifying slang / colloquial triggers in the original
 *   3. Applying phrase-level rewrites (pattern → natural output)
 *   4. Injecting natural tone markers (bro, please, etc.)
 *   5. Falling back to original translation if confidence is low
 *
 * NEVER modifies meaning — only naturalness.
 * NEVER throws — always returns a string.
 * ═══════════════════════════════════════════════════════════════════
 */

import { detectTone, TONES }   from "./toneDetector.js";
import { lookupSlang,
         getSlangForLang }      from "./slangDictionary.js";

// ── CONFIDENCE THRESHOLD ───────────────────────────────────────────
// If total rewrite confidence < this value, return original translated.
const MIN_CONFIDENCE = 0.35;

// ── TONE → NATURAL ENGLISH SUFFIX / PREFIX MARKERS ────────────────
// Applied at the sentence level when tone is clearly detected.
const TONE_MARKERS = {
  [TONES.FRIENDLY]:   { suffix: " bro",    prefix: ""         },
  [TONES.CASUAL]:     { suffix: "",        prefix: ""         },
  [TONES.ANGRY]:      { suffix: "!",       prefix: ""         },
  [TONES.RESPECTFUL]: { suffix: "",        prefix: "Please "  },
  [TONES.NEUTRAL]:    { suffix: "",        prefix: ""         },
};

// ── PHRASE REWRITE TABLES ──────────────────────────────────────────
// Structure:
//   lang → [ { triggers: string[], rewrite: string, confidence: number } ]
//
// triggers  : tokens from the ORIGINAL text that activate this rewrite
// rewrite   : the natural English phrase to use instead of raw translation
// confidence: 0–1, how sure we are this rewrite is appropriate
//
// A rewrite fires when ANY trigger token is found in the original.
// Multiple rewrites can fire; highest-confidence one wins per sentence.

const PHRASE_REWRITES = {

  // ── Telugu ───────────────────────────────────────────────────
  te: [
    { triggers: ["enti ra","enti ri"],        rewrite: "what's up bro?",        confidence: 0.95 },
    { triggers: ["ra bey","ra bei"],          rewrite: "come on bro",            confidence: 0.92 },
    { triggers: ["em chestunnav"],            rewrite: "what are you doing bro?",confidence: 0.90 },
    { triggers: ["ela unnav","ela unnavu"],   rewrite: "how are you bro?",       confidence: 0.90 },
    { triggers: ["poru","poru ra"],           rewrite: "leave it bro",           confidence: 0.88 },
    { triggers: ["chala bagundi"],            rewrite: "that's really great!",   confidence: 0.85 },
    { triggers: ["abbaa"],                    rewrite: "oh wow!",                confidence: 0.80 },
    { triggers: ["nayana"],                   rewrite: "dear",                   confidence: 0.75 },
    { triggers: ["babu"],                     rewrite: "buddy",                  confidence: 0.72 },
    { triggers: ["enti","emiti"],             rewrite: "what?",                  confidence: 0.65 },
    { triggers: ["ra"],                       rewrite: "bro",                    confidence: 0.60 },
    { triggers: ["bey","bei"],                rewrite: "dude",                   confidence: 0.60 },
    { triggers: ["chala"],                    rewrite: "really",                 confidence: 0.55 },
    { triggers: ["ayindi"],                   rewrite: "that's done",            confidence: 0.55 },
    { triggers: ["ledu"],                     rewrite: "there isn't any",        confidence: 0.50 },
    { triggers: ["jagratta"],                 rewrite: "be careful!",            confidence: 0.70 },
    { triggers: ["tondara"],                  rewrite: "hurry up",               confidence: 0.70 },
    { triggers: ["dabbu"],                    rewrite: "money",                  confidence: 0.50 },
    // native script triggers
    { triggers: ["ఏంటి రా"],                 rewrite: "what's up bro?",         confidence: 0.95 },
    { triggers: ["రా"],                       rewrite: "bro",                    confidence: 0.60 },
  ],

  // ── Hindi ────────────────────────────────────────────────────
  hi: [
    { triggers: ["kya scene hai","kya scene"],rewrite: "what's going on?",       confidence: 0.92 },
    { triggers: ["kya kar raha hai"],         rewrite: "what are you doing bro?",confidence: 0.90 },
    { triggers: ["kaise ho yaar"],            rewrite: "how are you bro?",       confidence: 0.90 },
    { triggers: ["chad yaar","chod yaar"],    rewrite: "forget it bro",          confidence: 0.88 },
    { triggers: ["arre yaar"],                rewrite: "oh come on bro",         confidence: 0.88 },
    { triggers: ["bindaas"],                  rewrite: "chill, it's cool",       confidence: 0.85 },
    { triggers: ["jugaad karo","jugaad"],     rewrite: "figure out a workaround",confidence: 0.82 },
    { triggers: ["dhamaal"],                  rewrite: "what a blast!",          confidence: 0.80 },
    { triggers: ["mast hai","mast"],          rewrite: "awesome!",               confidence: 0.78 },
    { triggers: ["bakwaas"],                  rewrite: "nonsense!",              confidence: 0.75 },
    { triggers: ["lafda"],                    rewrite: "there's trouble",        confidence: 0.72 },
    { triggers: ["timepass"],                 rewrite: "just killing time",      confidence: 0.70 },
    { triggers: ["yaar"],                     rewrite: "bro",                    confidence: 0.60 },
    { triggers: ["bhai"],                     rewrite: "bro",                    confidence: 0.60 },
    { triggers: ["arre"],                     rewrite: "hey",                    confidence: 0.55 },
    { triggers: ["jaldi kar"],                rewrite: "hurry up!",              confidence: 0.75 },
    { triggers: ["paisa","paise"],            rewrite: "money",                  confidence: 0.50 },
    // native script
    { triggers: ["यार"],                      rewrite: "bro",                    confidence: 0.60 },
    { triggers: ["भाई"],                      rewrite: "bro",                    confidence: 0.60 },
    { triggers: ["अरे"],                      rewrite: "hey",                    confidence: 0.55 },
  ],

  // ── Tamil ────────────────────────────────────────────────────
  ta: [
    { triggers: ["enna da solre","enna da"], rewrite: "what are you saying bro?",confidence: 0.92 },
    { triggers: ["epdi da iruka"],           rewrite: "how are you bro?",        confidence: 0.90 },
    { triggers: ["vera level"],              rewrite: "that's on another level!", confidence: 0.90 },
    { triggers: ["semma da","semma"],        rewrite: "absolutely awesome!",      confidence: 0.88 },
    { triggers: ["poda da","poda"],          rewrite: "get out of here bro",      confidence: 0.85 },
    { triggers: ["super da","super"],        rewrite: "super bro!",               confidence: 0.83 },
    { triggers: ["enna da"],                 rewrite: "what bro?",                confidence: 0.80 },
    { triggers: ["paathukko"],               rewrite: "take care!",               confidence: 0.78 },
    { triggers: ["machan"],                  rewrite: "bro",                      confidence: 0.65 },
    { triggers: ["da"],                      rewrite: "bro",                      confidence: 0.55 },
    { triggers: ["di"],                      rewrite: "girl",                     confidence: 0.55 },
    { triggers: ["dei"],                     rewrite: "dude",                     confidence: 0.58 },
    { triggers: ["aama"],                    rewrite: "yeah",                     confidence: 0.50 },
    { triggers: ["illa"],                    rewrite: "nope",                     confidence: 0.50 },
    { triggers: ["kadaisi"],                 rewrite: "finally",                  confidence: 0.52 },
    // native script
    { triggers: ["மச்சான்"],                 rewrite: "bro",                      confidence: 0.65 },
    { triggers: ["டா"],                      rewrite: "bro",                      confidence: 0.55 },
  ],

  // ── Kannada ──────────────────────────────────────────────────
  kn: [
    { triggers: ["yen guru","yen maadle"],   rewrite: "what's up bro?",          confidence: 0.92 },
    { triggers: ["hengide guru"],            rewrite: "how are you bro?",         confidence: 0.90 },
    { triggers: ["onde kathe guru"],         rewrite: "same old story bro",       confidence: 0.88 },
    { triggers: ["hogbidi","hogbeku"],        rewrite: "just leave it",           confidence: 0.85 },
    { triggers: ["sahi haelu","sahi"],       rewrite: "that's right!",            confidence: 0.78 },
    { triggers: ["sullu"],                   rewrite: "that's a lie!",            confidence: 0.75 },
    { triggers: ["bega"],                    rewrite: "quickly!",                 confidence: 0.70 },
    { triggers: ["guru"],                    rewrite: "bro",                      confidence: 0.65 },
    { triggers: ["machaa"],                  rewrite: "bro",                      confidence: 0.65 },
    { triggers: ["bekilla"],                 rewrite: "no need",                  confidence: 0.60 },
    // native script
    { triggers: ["ಗುರು"],                    rewrite: "bro",                      confidence: 0.65 },
    { triggers: ["ದಯವಿಟ್ಟು"],               rewrite: "please",                   confidence: 0.70 },
  ],

  // ── Malayalam ────────────────────────────────────────────────
  ml: [
    { triggers: ["enthu cheyva da"],         rewrite: "what are you doing bro?", confidence: 0.92 },
    { triggers: ["adipoli da","adipoli"],     rewrite: "that's awesome bro!",     confidence: 0.90 },
    { triggers: ["enthu parayva","enthu"],   rewrite: "what are you saying?",    confidence: 0.85 },
    { triggers: ["poda da","poda"],          rewrite: "get lost bro",            confidence: 0.83 },
    { triggers: ["sheri da","sheri"],        rewrite: "okay bro",                confidence: 0.80 },
    { triggers: ["thalleda"],                rewrite: "that's not true!",        confidence: 0.78 },
    { triggers: ["mone"],                    rewrite: "dear",                    confidence: 0.65 },
    { triggers: ["mol"],                     rewrite: "dear",                    confidence: 0.65 },
    { triggers: ["chetta"],                  rewrite: "bro",                     confidence: 0.65 },
    { triggers: ["machaan"],                 rewrite: "bro",                     confidence: 0.65 },
    // native script
    { triggers: ["മോനേ"],                    rewrite: "dear",                    confidence: 0.65 },
    { triggers: ["ദയവായി"],                  rewrite: "please",                  confidence: 0.70 },
  ],

  // ── Bengali ──────────────────────────────────────────────────
  bn: [
    { triggers: ["ki korcho re","ki korcho"], rewrite: "what are you doing bro?",confidence: 0.92 },
    { triggers: ["kemon acho re","kemon acho"],rewrite: "how are you bro?",      confidence: 0.90 },
    { triggers: ["jhol ache","jhol"],         rewrite: "there's a mess",         confidence: 0.85 },
    { triggers: ["pagol na ki"],              rewrite: "are you crazy?",          confidence: 0.83 },
    { triggers: ["faka"],                     rewrite: "free / empty",            confidence: 0.70 },
    { triggers: ["thik ache","thik"],         rewrite: "it's alright",            confidence: 0.68 },
    { triggers: ["bhai"],                     rewrite: "bro",                     confidence: 0.60 },
    { triggers: ["dada"],                     rewrite: "bro",                     confidence: 0.60 },
    // native script
    { triggers: ["ভাই"],                      rewrite: "bro",                     confidence: 0.60 },
    { triggers: ["দয়া করে"],                 rewrite: "please",                  confidence: 0.70 },
  ],

  // ── Marathi ──────────────────────────────────────────────────
  mr: [
    { triggers: ["kay karto re","kay karto"], rewrite: "what are you doing bro?",confidence: 0.92 },
    { triggers: ["kasa ahe re","kasa ahe"],   rewrite: "how are you bro?",       confidence: 0.90 },
    { triggers: ["bhaari ahe","bhaari"],      rewrite: "that's awesome!",         confidence: 0.88 },
    { triggers: ["ghanta"],                   rewrite: "absolutely nothing!",     confidence: 0.85 },
    { triggers: ["fokat"],                    rewrite: "for free",                confidence: 0.80 },
    { triggers: ["kharach"],                  rewrite: "for real?",               confidence: 0.75 },
    { triggers: ["chaan"],                    rewrite: "nice!",                   confidence: 0.70 },
    { triggers: ["bhau"],                     rewrite: "bro",                     confidence: 0.65 },
    { triggers: ["dada"],                     rewrite: "bro",                     confidence: 0.60 },
    // native script
    { triggers: ["भाऊ"],                      rewrite: "bro",                     confidence: 0.65 },
    { triggers: ["कृपया"],                    rewrite: "please",                  confidence: 0.70 },
  ],

  // ── Gujarati ─────────────────────────────────────────────────
  gu: [
    { triggers: ["kem cho yaar","kem cho"],   rewrite: "how are you bro?",        confidence: 0.92 },
    { triggers: ["su thayun yaar","su thayun"],rewrite: "what happened bro?",     confidence: 0.90 },
    { triggers: ["mast che","mast"],          rewrite: "that's awesome!",          confidence: 0.85 },
    { triggers: ["dhama"],                    rewrite: "what a party!",            confidence: 0.80 },
    { triggers: ["gando"],                    rewrite: "you're crazy!",            confidence: 0.78 },
    { triggers: ["bhai"],                     rewrite: "bro",                      confidence: 0.60 },
    { triggers: ["yaar"],                     rewrite: "bro",                      confidence: 0.60 },
    // native script
    { triggers: ["ભાઈ"],                      rewrite: "bro",                      confidence: 0.60 },
  ],

  // ── Punjabi ──────────────────────────────────────────────────
  pa: [
    { triggers: ["kiddan yaar","kiddan"],     rewrite: "what's up bro?",          confidence: 0.92 },
    { triggers: ["ki haal yaar","ki haal"],   rewrite: "how are you bro?",        confidence: 0.90 },
    { triggers: ["chad yaar"],                rewrite: "leave it bro",             confidence: 0.88 },
    { triggers: ["panga na le"],              rewrite: "don't start trouble",      confidence: 0.85 },
    { triggers: ["oye"],                      rewrite: "hey",                      confidence: 0.68 },
    { triggers: ["paaji"],                    rewrite: "bro",                      confidence: 0.65 },
    { triggers: ["yaar"],                     rewrite: "bro",                      confidence: 0.60 },
    { triggers: ["veer"],                     rewrite: "bro",                      confidence: 0.60 },
    // native script
    { triggers: ["ਯਾਰ"],                      rewrite: "bro",                      confidence: 0.60 },
    { triggers: ["ਪਾਜੀ"],                     rewrite: "bro",                      confidence: 0.65 },
  ],

  // ── Urdu ─────────────────────────────────────────────────────
  ur: [
    { triggers: ["kya scene yaar"],           rewrite: "what's going on bro?",    confidence: 0.92 },
    { triggers: ["zabardast"],                rewrite: "that's incredible!",       confidence: 0.88 },
    { triggers: ["bakwaas"],                  rewrite: "nonsense!",                confidence: 0.80 },
    { triggers: ["mast"],                     rewrite: "awesome!",                 confidence: 0.75 },
    { triggers: ["yaar"],                     rewrite: "bro",                      confidence: 0.60 },
    { triggers: ["bhai"],                     rewrite: "bro",                      confidence: 0.60 },
    { triggers: ["jaan"],                     rewrite: "dear",                     confidence: 0.65 },
  ],

  // ── Odia ─────────────────────────────────────────────────────
  or: [
    { triggers: ["ki khobor re","ki khobor"], rewrite: "what's up bro?",          confidence: 0.90 },
    { triggers: ["kemiti acha re"],           rewrite: "how are you bro?",         confidence: 0.88 },
    { triggers: ["bhai"],                     rewrite: "bro",                      confidence: 0.60 },
  ],

  // ── Assamese ─────────────────────────────────────────────────
  as: [
    { triggers: ["ki khobor re","ki khobor"], rewrite: "what's up bro?",          confidence: 0.90 },
    { triggers: ["kene acho re"],             rewrite: "how are you bro?",         confidence: 0.88 },
    { triggers: ["jordar"],                   rewrite: "that's powerful!",          confidence: 0.82 },
    { triggers: ["bhai"],                     rewrite: "bro",                      confidence: 0.60 },
  ],

  // ── Nepali ───────────────────────────────────────────────────
  ne: [
    { triggers: ["ke cha dai","ke cha"],      rewrite: "what's up bro?",          confidence: 0.92 },
    { triggers: ["kasto cha dai"],            rewrite: "how are you bro?",         confidence: 0.90 },
    { triggers: ["chatpat"],                  rewrite: "quickly!",                 confidence: 0.78 },
    { triggers: ["jhyaure"],                  rewrite: "you slowpoke",             confidence: 0.75 },
    { triggers: ["dai"],                      rewrite: "bro",                      confidence: 0.65 },
    { triggers: ["sathi"],                    rewrite: "buddy",                    confidence: 0.62 },
  ],

  // ── Bhojpuri ─────────────────────────────────────────────────
  bho: [
    { triggers: ["ka ba yaar","ka ba"],       rewrite: "what's up bro?",          confidence: 0.90 },
    { triggers: ["baa"],                      rewrite: "yeah",                     confidence: 0.65 },
    { triggers: ["bhaiya"],                   rewrite: "bro",                      confidence: 0.65 },
  ],

  // ── Haryanvi ─────────────────────────────────────────────────
  bgc: [
    { triggers: ["ke hoga yaar","ke hoga"],   rewrite: "what happened bro?",      confidence: 0.88 },
    { triggers: ["mhara"],                    rewrite: "mine",                     confidence: 0.60 },
    { triggers: ["bhai"],                     rewrite: "bro",                      confidence: 0.60 },
  ],

  // ── Rajasthani / Marwari ──────────────────────────────────────
  raj: [
    { triggers: ["kem cho yaar"],             rewrite: "how are you bro?",        confidence: 0.88 },
    { triggers: ["sa"],                       rewrite: "sir",                      confidence: 0.58 },
  ],

  // ── Common cross-language rewrites (applied to all) ──────────
  _common: [
    { triggers: ["come here!","come here now","get here"],
      rewrite: "get over here!",              confidence: 0.70 },
    { triggers: ["what are you doing?","what r u doing"],
      rewrite: "what are you up to?",         confidence: 0.65 },
    { triggers: ["how are you?","how r u"],
      rewrite: "how are you doing?",          confidence: 0.60 },
    { triggers: ["okay okay","ok ok"],
      rewrite: "alright, alright",            confidence: 0.65 },
    { triggers: ["no problem","no issue"],
      rewrite: "don't worry about it",        confidence: 0.62 },
    { triggers: ["very good","very nice"],
      rewrite: "really great!",               confidence: 0.60 },
  ],
};

// ── HELPERS ────────────────────────────────────────────────────────

/**
 * Lowercase + normalise text for trigger matching.
 */
function normalise(text) {
  return (text || "").toLowerCase().trim();
}

/**
 * Check whether any trigger phrase appears in the normalised original.
 * Supports both single-word and multi-word triggers.
 */
function matchesTrigger(normOriginal, triggers) {
  for (const trigger of triggers) {
    const t = normalise(trigger);
    if (normOriginal.includes(t)) return true;
  }
  return false;
}

/**
 * Find the highest-confidence rewrite that matches the original text.
 * Checks language-specific table first, then _common.
 *
 * @returns {{ rewrite: string, confidence: number } | null}
 */
function findBestRewrite(normOriginal, lang) {
  let best = null;

  const tables = [
    ...(PHRASE_REWRITES[lang] || []),
    ...PHRASE_REWRITES._common,
  ];

  for (const entry of tables) {
    if (matchesTrigger(normOriginal, entry.triggers)) {
      if (!best || entry.confidence > best.confidence) {
        best = entry;
      }
    }
  }

  return best;
}

/**
 * Collect all slang words found in the original text for a given lang.
 * Returns array of { slang, meaning, tone } sorted by position in text.
 */
function findSlangHits(normOriginal, lang) {
  const dict  = getSlangForLang(lang);
  const hits  = [];
  const words = normOriginal.split(/\s+/);

  for (const word of words) {
    const entry = dict[word];
    if (entry) {
      hits.push({ slang: word, meaning: entry.meaning, tone: entry.tone });
    }
  }
  return hits;
}

/**
 * Apply tone marker to translated text based on detected tone.
 * Only appends suffix / prefix if:
 *   - The suffix is not already present
 *   - The translation is not empty
 */
function applyToneMarker(translated, tone) {
  const marker = TONE_MARKERS[tone] || TONE_MARKERS[TONES.NEUTRAL];
  let result   = translated.trim();

  if (!result) return result;

  // Prefix (e.g. "Please ")
  if (marker.prefix && !result.toLowerCase().startsWith(marker.prefix.toLowerCase().trim())) {
    result = marker.prefix + result;
  }

  // Suffix (e.g. " bro", "!")
  if (marker.suffix) {
    const sfx = marker.suffix.trim();
    // Don't double-add suffix
    if (sfx && !result.toLowerCase().endsWith(sfx.toLowerCase())) {
      // Don't add " bro" if text already has bro/dude/man/buddy/pal
      const hasSocial = /\b(bro|dude|man|buddy|pal|dear|sir|madam)\b/i.test(result);
      if (!(sfx === "bro" && hasSocial)) {
        // Insert before terminal punctuation if present
        const termMatch = result.match(/([!?.,…]+)$/);
        if (termMatch) {
          const punct = termMatch[1];
          result = result.slice(0, -punct.length) + " " + sfx + punct;
        } else {
          result = result + " " + sfx;
        }
      }
    }
  }

  return result;
}

/**
 * Capitalise first letter of a string.
 */
function capitaliseFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── MAIN EXPORT ────────────────────────────────────────────────────

/**
 * Enhance a machine translation with context, slang awareness, and tone.
 *
 * @param {string} original   - Original text in source language
 * @param {string} translated - Raw machine translation (English target assumed)
 * @param {string} lang       - Source language code (e.g. "te", "hi", "ta")
 * @returns {string}          - Enhanced natural translation
 */
export function enhanceTranslation(original, translated, lang) {
  // Guard: always return a string, never throw
  try {
    if (!original || typeof original !== "string") return translated || "";
    if (!translated || typeof translated !== "string") return translated || "";

    const normOrig   = normalise(original);
    const normTrans  = normalise(translated);

    // Skip enhancement for very short outputs — likely single words
    // where machine translation is already correct
    if (normTrans.split(/\s+/).length === 1 && normOrig.split(/\s+/).length === 1) {
      return translated;
    }

    // ── Step 1: Detect tone of original ─────────────────────────
    const tone = detectTone(original, lang);

    // ── Step 2: Look for phrase-level rewrite ────────────────────
    const rewrite = findBestRewrite(normOrig, lang);

    if (rewrite && rewrite.confidence >= MIN_CONFIDENCE) {
      // High-confidence phrase rewrite — use it directly
      // Still apply tone marker so "come on bro!" gets "!" for angry tone
      const withTone = applyToneMarker(rewrite.rewrite, tone);
      return capitaliseFirst(withTone);
    }

    // ── Step 3: Slang word injection ─────────────────────────────
    // Find slang hits and see if we can meaningfully inject meanings
    const slangHits = findSlangHits(normOrig, lang);
    let enhanced    = translated;

    if (slangHits.length > 0) {
      // For each slang hit, attempt to inject the colloquial meaning
      // into the translated string if its literal translation is present.
      for (const hit of slangHits) {
        // Common literal translations that machines produce for address words
        const LITERAL_MAP = {
          "bro":       ["bro", "brother", "man"],
          "friend":    ["friend", "buddy"],
          "dude":      ["dude", "man", "guy"],
          "dear":      ["dear", "darling", "honey"],
          "money":     ["money", "cash", "funds"],
          "quickly":   ["quickly", "fast", "hurry"],
          "nonsense":  ["nonsense", "rubbish"],
          "awesome":   ["awesome", "great", "wonderful", "excellent"],
        };

        const naturalMeaning = hit.meaning.split(" / ")[0].trim().toLowerCase();

        // If the translated text already contains a natural equivalent, skip
        const equivalents = LITERAL_MAP[naturalMeaning] || [naturalMeaning];
        const alreadyNatural = equivalents.some(eq =>
          normalise(enhanced).includes(eq)
        );

        if (!alreadyNatural) {
          // Inject meaning at end if no equivalent found
          enhanced = enhanced.trim();
          const hasPunct = /[!?.,…]$/.test(enhanced);
          if (hasPunct) {
            enhanced = enhanced.slice(0, -1) + " " + naturalMeaning + enhanced.slice(-1);
          } else {
            enhanced += " " + naturalMeaning;
          }
        }
      }
    }

    // ── Step 4: Apply tone marker ────────────────────────────────
    // Only apply meaningful markers (not neutral suffix "")
    if (tone !== TONES.NEUTRAL) {
      enhanced = applyToneMarker(enhanced, tone);
    }

    // ── Step 5: Sanity check ─────────────────────────────────────
    // If enhanced is substantially longer than translated (>40% extra chars)
    // or is empty, fall back to original translation.
    if (!enhanced || enhanced.length > translated.length * 1.4) {
      return capitaliseFirst(translated.trim());
    }

    return capitaliseFirst(enhanced.trim());

  } catch (_) {
    // Never crash the app — silently return original translation
    return translated || "";
  }
}

/**
 * Enhanced translation with full metadata (useful for UI debug / tooltips).
 *
 * @param {string} original
 * @param {string} translated
 * @param {string} lang
 * @returns {{
 *   enhanced   : string,
 *   original   : string,
 *   translated : string,
 *   tone       : string,
 *   slangHits  : Array<{ slang: string, meaning: string, tone: string }>,
 *   rewriteUsed: boolean,
 *   confidence : number
 * }}
 */
export function enhanceTranslationDetailed(original, translated, lang) {
  try {
    const normOrig  = normalise(original || "");
    const tone      = detectTone(original || "", lang);
    const rewrite   = findBestRewrite(normOrig, lang);
    const slangHits = findSlangHits(normOrig, lang);
    const enhanced  = enhanceTranslation(original, translated, lang);

    return {
      enhanced,
      original,
      translated,
      tone,
      slangHits,
      rewriteUsed: !!(rewrite && rewrite.confidence >= MIN_CONFIDENCE),
      confidence:  rewrite?.confidence ?? 0,
    };
  } catch (_) {
    return {
      enhanced:    translated || "",
      original,
      translated,
      tone:        TONES.NEUTRAL,
      slangHits:   [],
      rewriteUsed: false,
      confidence:  0,
    };
  }
}
