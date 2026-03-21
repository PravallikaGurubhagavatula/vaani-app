/**
 * Vaani — contextTranslator.js
 * ═══════════════════════════════════════════════════════════════════
 * Context-aware translation enhancer.
 * Takes a raw machine translation and makes it sound natural by:
 *
 *   1. Slang injection   — replace literal slang translations with
 *                          colloquial English equivalents
 *   2. Tone wrapping     — add natural tone markers (bro, please, etc.)
 *                          based on detected tone
 *   3. Phrase rewriting  — known awkward literal → natural rewrites
 *   4. Cleanup           — strip double spaces, fix capitalisation
 *
 * Always falls back to `translated` (or `original`) if any step fails.
 * Synchronous, zero network calls, safe on every keystroke.
 * ═══════════════════════════════════════════════════════════════════
 */

import { getSlangForLang } from "./slangDictionary.js";
import { detectTone, TONES } from "./toneDetector.js";

// ── PHRASE-LEVEL REWRITE TABLES ────────────────────────────────────
// Keyed by source language code.
// Each entry: { pattern: RegExp | string, replacement: string }
// Patterns are matched against the TRANSLATED (English) string.
// More specific patterns must come before generic ones.

const PHRASE_REWRITES = {

  // ── Telugu source ───────────────────────────────────────────────
  te: [
    { pattern: /\bwhat is it\b/gi,            replacement: "what's up" },
    { pattern: /\bwhat is this\b/gi,           replacement: "what's this" },
    { pattern: /\bwhat happened\b/gi,          replacement: "what happened" },
    { pattern: /\bhow are you doing\b/gi,      replacement: "how's it going" },
    { pattern: /\bgo away\b/gi,               replacement: "get lost" },
    { pattern: /\bleave it\b/gi,              replacement: "forget it" },
    { pattern: /\bdo not worry\b/gi,          replacement: "don't worry" },
    { pattern: /\bvery good\b/gi,             replacement: "nice one" },
    { pattern: /\bvery nice\b/gi,             replacement: "so good" },
    { pattern: /\bwhat brother\b/gi,          replacement: "what bro" },
    { pattern: /\bwhat sister\b/gi,           replacement: "what sis" },
    { pattern: /\bokay brother\b/gi,          replacement: "okay bro" },
    { pattern: /\byou come\b/gi,              replacement: "come on" },
    { pattern: /\bsay it\b/gi,               replacement: "tell me" },
    { pattern: /\bwhat do you mean\b/gi,      replacement: "what do you mean" },
    { pattern: /\bsmall amount\b/gi,          replacement: "a little" },
    { pattern: /\bcome here brother\b/gi,     replacement: "come here bro" },
    { pattern: /\bcome bro\b/gi,             replacement: "come on bro" },
    { pattern: /\byes brother\b/gi,          replacement: "yes bro" },
    { pattern: /\bno brother\b/gi,           replacement: "no bro" },
    { pattern: /\btell brother\b/gi,         replacement: "tell me bro" },
  ],

  // ── Hindi source ────────────────────────────────────────────────
  hi: [
    { pattern: /\bwhat is it\b/gi,            replacement: "what's up" },
    { pattern: /\bwhat is the matter\b/gi,    replacement: "what's the matter" },
    { pattern: /\bhow are you\b/gi,           replacement: "how are you doing" },
    { pattern: /\bfriend\b/gi,               replacement: "buddy" },
    { pattern: /\bbrother\b/gi,              replacement: "bro" },
    { pattern: /\bgo away\b/gi,             replacement: "get out of here" },
    { pattern: /\bleave it\b/gi,            replacement: "forget it" },
    { pattern: /\bno problem\b/gi,          replacement: "no worries" },
    { pattern: /\bvery good\b/gi,           replacement: "nice one" },
    { pattern: /\bnonsense\b/gi,            replacement: "nonsense" },
    { pattern: /\bkill time\b/gi,           replacement: "timepass" },
    { pattern: /\bcaught in trouble\b/gi,   replacement: "in a mess" },
    { pattern: /\bthere is no problem\b/gi, replacement: "no worries" },
    { pattern: /\bdo not worry\b/gi,        replacement: "don't worry" },
    { pattern: /\bcome quickly\b/gi,        replacement: "come fast" },
    { pattern: /\bwhat the news\b/gi,       replacement: "what's the news" },
    { pattern: /\bmy friend\b/gi,           replacement: "my buddy" },
    { pattern: /\bolder brother\b/gi,       replacement: "bro" },
  ],

  // ── Tamil source ────────────────────────────────────────────────
  ta: [
    { pattern: /\bwhat is it\b/gi,           replacement: "what's up" },
    { pattern: /\bwhat brother\b/gi,         replacement: "what bro" },
    { pattern: /\bwhat man\b/gi,             replacement: "what bro" },
    { pattern: /\bhow brother\b/gi,          replacement: "how bro" },
    { pattern: /\bvery good\b/gi,            replacement: "super" },
    { pattern: /\bgo away\b/gi,              replacement: "get lost" },
    { pattern: /\bnext level\b/gi,           replacement: "next level" },
    { pattern: /\bdo not disturb\b/gi,       replacement: "stop bothering" },
    { pattern: /\bcome quickly\b/gi,         replacement: "come fast" },
    { pattern: /\bok ok\b/gi,                replacement: "okay okay" },
    { pattern: /\bsuperb\b/gi,              replacement: "awesome" },
  ],

  // ── Kannada source ──────────────────────────────────────────────
  kn: [
    { pattern: /\bwhat is it\b/gi,           replacement: "what's up" },
    { pattern: /\bhow are you\b/gi,          replacement: "how's it going" },
    { pattern: /\bwhat man\b/gi,             replacement: "what bro" },
    { pattern: /\bgo away\b/gi,              replacement: "get lost" },
    { pattern: /\bvery correct\b/gi,         replacement: "spot on" },
    { pattern: /\bone story\b/gi,            replacement: "same old story" },
    { pattern: /\bneed not\b/gi,             replacement: "don't need it" },
  ],

  // ── Malayalam source ────────────────────────────────────────────
  ml: [
    { pattern: /\bwhat is it\b/gi,           replacement: "what's up" },
    { pattern: /\bhow is it\b/gi,            replacement: "how's it going" },
    { pattern: /\bgo away\b/gi,              replacement: "get lost" },
    { pattern: /\bdo not disturb\b/gi,       replacement: "stop bothering" },
    { pattern: /\bexcellent\b/gi,            replacement: "awesome" },
    { pattern: /\bokay okay\b/gi,            replacement: "alright alright" },
    { pattern: /\bwhere are you going\b/gi,  replacement: "where you off to" },
    { pattern: /\bnot true\b/gi,            replacement: "that's not true" },
  ],

  // ── Bengali source ──────────────────────────────────────────────
  bn: [
    { pattern: /\bwhat is it\b/gi,           replacement: "what's up" },
    { pattern: /\bhow are you\b/gi,          replacement: "how are you doing" },
    { pattern: /\bgo away\b/gi,              replacement: "get out" },
    { pattern: /\bcomplicated\b/gi,          replacement: "messy" },
    { pattern: /\bvery good\b/gi,           replacement: "nice one" },
  ],

  // ── Marathi source ──────────────────────────────────────────────
  mr: [
    { pattern: /\bwhat is it\b/gi,           replacement: "what's up" },
    { pattern: /\bhow are you\b/gi,          replacement: "how are you doing" },
    { pattern: /\bgo away\b/gi,              replacement: "get lost" },
    { pattern: /\bfree of cost\b/gi,         replacement: "for free" },
    { pattern: /\bvery heavy\b/gi,           replacement: "really intense" },
  ],

  // ── Gujarati source ─────────────────────────────────────────────
  gu: [
    { pattern: /\bhow are you\b/gi,          replacement: "how are you doing" },
    { pattern: /\bgo away\b/gi,              replacement: "get lost" },
    { pattern: /\bvery good\b/gi,           replacement: "nice one" },
  ],

  // ── Punjabi source ──────────────────────────────────────────────
  pa: [
    { pattern: /\bhow are you\b/gi,          replacement: "how's it going" },
    { pattern: /\bgo away\b/gi,              replacement: "get out" },
    { pattern: /\bwell done\b/gi,            replacement: "well done" },
    { pattern: /\bleave it friend\b/gi,      replacement: "forget it yaar" },
    { pattern: /\bhack\b/gi,               replacement: "jugaad" },
  ],

  // ── Urdu source ─────────────────────────────────────────────────
  ur: [
    { pattern: /\bhow are you\b/gi,          replacement: "how are you doing" },
    { pattern: /\bgo away\b/gi,              replacement: "get out" },
    { pattern: /\bvery good\b/gi,           replacement: "nice one" },
    { pattern: /\brespected one\b/gi,        replacement: "sir" },
  ],

  // ── Odia source ─────────────────────────────────────────────────
  or: [
    { pattern: /\bhow are you\b/gi,          replacement: "how are you doing" },
    { pattern: /\bwhat is the news\b/gi,     replacement: "what's up" },
    { pattern: /\bvery good\b/gi,           replacement: "nice one" },
  ],

  // ── Bhojpuri source ─────────────────────────────────────────────
  bho: [
    { pattern: /\bwhat is it\b/gi,           replacement: "what's going on" },
    { pattern: /\bhow are you\b/gi,          replacement: "how are you doing" },
    { pattern: /\bbrother\b/gi,             replacement: "bro" },
  ],

  // ── Common rewrites applied to ALL languages ────────────────────
  _common: [
    { pattern: /\bdo not\b/gi,              replacement: "don't" },
    { pattern: /\bcannot\b/gi,              replacement: "can't" },
    { pattern: /\bwill not\b/gi,            replacement: "won't" },
    { pattern: /\bshould not\b/gi,          replacement: "shouldn't" },
    { pattern: /\bwould not\b/gi,           replacement: "wouldn't" },
    { pattern: /\bcould not\b/gi,           replacement: "couldn't" },
    { pattern: /\bI am\b/g,                replacement: "I'm" },
    { pattern: /\bhe is\b/gi,              replacement: "he's" },
    { pattern: /\bshe is\b/gi,             replacement: "she's" },
    { pattern: /\bit is\b/gi,              replacement: "it's" },
    { pattern: /\bthey are\b/gi,           replacement: "they're" },
    { pattern: /\bwe are\b/gi,             replacement: "we're" },
    { pattern: /\byou are\b/gi,            replacement: "you're" },
    { pattern: /\bwhat is happening\b/gi,  replacement: "what's happening" },
    { pattern: /\bwhat is going on\b/gi,   replacement: "what's going on" },
    { pattern: /\bhow is it going\b/gi,    replacement: "how's it going" },
    { pattern: /\bthat is right\b/gi,      replacement: "that's right" },
    { pattern: /\bthat is wrong\b/gi,      replacement: "that's wrong" },
    { pattern: /\bvery much\b/gi,          replacement: "a lot" },
    { pattern: /\bok ok\b/gi,              replacement: "okay okay" },
    { pattern: /\bwhat brother\b/gi,       replacement: "what bro" },
    { pattern: /\bcome brother\b/gi,       replacement: "come on bro" },
    { pattern: /\byes brother\b/gi,        replacement: "yes bro" },
    { pattern: /\bno brother\b/gi,         replacement: "no bro" },
  ],
};

// ── TONE WRAPPERS ──────────────────────────────────────────────────
// After rewriting, optionally inject a tone marker so the sentence
// feels natural. Rules: { tone, position, marker, condition? }
//   position: "append" | "prepend" | "none"
//   condition: optional fn(translated) => bool — skip if false

const TONE_WRAPPERS = {
  [TONES.FRIENDLY]: [
    {
      marker: "bro",
      position: "append",
      condition: t => !/\bbro\b|\bman\b|\bdude\b|\byaar\b|\bda\b|\bdi\b|\bmachan\b/i.test(t),
    },
  ],
  [TONES.CASUAL]:     [],
  [TONES.ANGRY]:      [],
  [TONES.RESPECTFUL]: [
    {
      marker: "please",
      position: "prepend",
      condition: t =>
        !/\bplease\b|\bkindly\b/i.test(t) &&
        /^(come|go|tell|give|help|show|send|bring|make|do)/i.test(t.trim()),
    },
  ],
  [TONES.NEUTRAL]: [],
};

// ── SLANG MEANING → LIKELY LITERAL TRANSLATIONS ────────────────────
// When a slang word in the source maps to a meaning, these are the
// over-literal English words a machine translator might produce.

const SLANG_LITERAL_MAP = {
  "bro":                        ["brother","male sibling"],
  "bro / hey (masculine)":      ["brother","male friend","hey there"],
  "hey (feminine)":             ["sister","female friend","girl","female"],
  "friend / bro":               ["friend","companion","comrade","associate","ally"],
  "buddy":                      ["buddy","companion","associate"],
  "dude":                       ["man","person","individual"],
  "darling / dear":             ["darling","dear","beloved","sweetheart"],
  "what's up":                  ["what is happening","what is it","what is going on","what is this"],
  "very / a lot":               ["very much","a lot","greatly","extremely","a great deal"],
  "no / nothing":               ["there is nothing","there is no","nothing exists","not present"],
  "leave it / forget it":       ["leave it","forget it","let it go","abandon it"],
  "hurry up":                   ["come quickly","move fast","hurry","rush","be quick"],
  "money":                      ["currency","funds","cash","finances"],
  "awesome / great":            ["very good","excellent","wonderful","marvelous","outstanding"],
  "carefree / cool":            ["carefree","free spirited","unworried","relaxed"],
  "nonsense":                   ["rubbish","garbage","meaningless","absurd"],
  "hack / workaround":          ["hack","workaround","temporary solution","adjustment","fix"],
  "fun / chaos":                ["entertainment","excitement","chaos","disorder"],
  "get lost":                   ["go away","leave","depart","go","go from here"],
  "next level / amazing":       ["next level","extraordinary","superior","beyond normal"],
  "take care / be careful":     ["be careful","take care","be cautious","be alert"],
  "come on bro":                ["come here","come now","come here brother"],
  "elder bro / bro":            ["elder brother","older brother","senior brother"],
  "awesome / excellent":        ["excellent","very good","outstanding","perfect"],
  "okay / alright":             ["okay","alright","it is fine","it is okay","that is fine"],
};

// ── SLANG INJECTION ────────────────────────────────────────────────

const _INJECT_BLOCKLIST = new Set([
  "is","am","are","was","were","be","been","being","do","does","did",
  "have","has","had","will","would","can","could","shall","should",
  "the","a","an","in","on","at","to","of","and","or","but","if","as",
  "this","that","it","he","she","we","they","you","i","my","your",
]);

function injectSlangMeanings(original, translated, lang) {
  const slangDict  = getSlangForLang(lang);
  if (!slangDict || Object.keys(slangDict).length === 0) return translated;

  const origTokens = original.toLowerCase().split(/\s+/);
  let   result     = translated;

  for (const token of origTokens) {
    const clean = token.replace(/[^a-z\u0900-\u0DFF\u0C00-\u0C7F\u0B80-\u0BFF\u0A80-\u0AFF\u0A00-\u0A7F\u0980-\u09FF\u0B00-\u0B7F\u0C80-\u0CFF\u0D00-\u0D7F]/gi, "");
    if (!clean || _INJECT_BLOCKLIST.has(clean)) continue;

    const entry = slangDict[clean];
    if (!entry?.meaning) continue;

    const literalVariants = SLANG_LITERAL_MAP[entry.meaning] || [entry.meaning];
    for (const variant of literalVariants) {
      const rx = new RegExp(`\\b${_escapeRegex(variant)}\\b`, "gi");
      if (rx.test(result)) {
        result = result.replace(rx, entry.meaning);
        break;
      }
    }
  }

  return result;
}

function _escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── PHRASE REWRITER ────────────────────────────────────────────────

function applyRewrites(text, lang) {
  let result = text;

  const langRules = PHRASE_REWRITES[lang] || [];
  for (const rule of langRules) {
    result = result.replace(rule.pattern, rule.replacement);
  }

  for (const rule of PHRASE_REWRITES._common) {
    result = result.replace(rule.pattern, rule.replacement);
  }

  return result;
}

// ── TONE WRAPPER ───────────────────────────────────────────────────

function applyToneWrapper(text, tone) {
  const rules = TONE_WRAPPERS[tone] || [];
  let result  = text.trim();

  for (const rule of rules) {
    if (rule.condition && !rule.condition(result)) continue;

    if (rule.position === "append") {
      const stripped = result.replace(/[.!?…]+$/, "").trimEnd();
      const ending   = result.slice(stripped.length);
      result = `${stripped}, ${rule.marker}${ending}`;
    } else if (rule.position === "prepend") {
      result = `${_capitalise(rule.marker)} ${_lowerFirst(result)}`;
    }
  }

  return result;
}

function _capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function _lowerFirst(s) {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ── CLEANUP ────────────────────────────────────────────────────────

function cleanup(text) {
  return text
    .replace(/ {2,}/g, " ")
    .replace(/ ,/g, ",")
    .replace(/\s+([.!?…])/g, "$1")
    .replace(/([.!?…])\s*([.!?…])+/g, "$1")
    .trim();
}

// ── PASSTHROUGH GUARD ──────────────────────────────────────────────

function _looksLikePassthrough(original, translated) {
  if (!translated) return true;
  const o = original.trim().toLowerCase();
  const t = translated.trim().toLowerCase();
  if (o === t) return true;
  if (Math.abs(o.length - t.length) <= 2 && o.slice(0, 6) === t.slice(0, 6)) return true;
  return false;
}

// ── MAIN EXPORT ────────────────────────────────────────────────────

/**
 * Enhance a machine translation to sound natural and context-aware.
 *
 * @param {string} original   - Source text (any language / script)
 * @param {string} translated - Raw machine-translated English string
 * @param {string} lang       - Source language code (e.g. "te", "hi", "ta")
 * @returns {string}          - Enhanced translation (falls back to `translated`)
 */
export function enhanceTranslation(original, translated, lang) {
  if (!original || typeof original !== "string") return translated || "";
  if (!translated || typeof translated !== "string") return translated || "";
  if (!lang) return translated;
  if (_looksLikePassthrough(original, translated)) return translated;

  try {
    let result = translated.trim();

    // Step 1: Slang injection
    result = injectSlangMeanings(original, result, lang);

    // Step 2: Phrase-level rewrites
    result = applyRewrites(result, lang);

    // Step 3: Tone detection + wrapper
    const tone = detectTone(original, lang);
    result = applyToneWrapper(result, tone);

    // Step 4: Cleanup
    result = cleanup(result);

    // Step 5: Never return empty
    return result || translated;

  } catch (_) {
    return translated;
  }
}

/**
 * Debug variant — returns all intermediate steps.
 *
 * @param {string} original
 * @param {string} translated
 * @param {string} lang
 * @returns {{
 *   original: string,
 *   raw: string,
 *   afterSlang: string,
 *   afterRewrites: string,
 *   tone: string,
 *   afterToneWrap: string,
 *   final: string,
 *   error?: string
 * }}
 */
export function enhanceTranslationDetailed(original, translated, lang) {
  if (!original || !translated || !lang) {
    return {
      original, raw: translated, afterSlang: translated,
      afterRewrites: translated, tone: TONES.NEUTRAL,
      afterToneWrap: translated, final: translated,
    };
  }

  try {
    const afterSlang    = injectSlangMeanings(original, translated.trim(), lang);
    const afterRewrites = applyRewrites(afterSlang, lang);
    const tone          = detectTone(original, lang);
    const afterToneWrap = applyToneWrapper(afterRewrites, tone);
    const final         = cleanup(afterToneWrap) || translated;

    return { original, raw: translated, afterSlang, afterRewrites, tone, afterToneWrap, final };

  } catch (e) {
    return {
      original, raw: translated, afterSlang: translated,
      afterRewrites: translated, tone: TONES.NEUTRAL,
      afterToneWrap: translated, final: translated,
      error: e.message,
    };
  }
}
