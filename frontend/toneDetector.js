/**
 * Vaani — toneDetector.js
 * ═══════════════════════════════════════════════════════════════════
 * Lightweight tone detector for all Indian languages.
 * Returns one of: "friendly" | "angry" | "casual" | "respectful" | "neutral"
 *
 * Detection pipeline (in order of priority):
 *   1. Punctuation & casing signals
 *   2. Language-specific angry / command keywords
 *   3. Language-specific respectful keywords
 *   4. Slang dictionary tone lookup
 *   5. Friendly keyword patterns
 *   6. Casual keyword patterns
 *   7. Fallback → "neutral"
 *
 * Designed to be synchronous and O(n) on token count — no external
 * calls, no heavy regex backtracking, safe to call on every keystroke.
 * ═══════════════════════════════════════════════════════════════════
 */

import { getSlangForLang } from "./slangDictionary.js";

// ── TONE CONSTANTS ─────────────────────────────────────────────────
export const TONES = Object.freeze({
  FRIENDLY:   "friendly",
  ANGRY:      "angry",
  CASUAL:     "casual",
  RESPECTFUL: "respectful",
  NEUTRAL:    "neutral",
});

// ── PUNCTUATION / CASING WEIGHTS ──────────────────────────────────
// Each signal adds to a tone score map; highest score wins.
const PUNCT_RULES = [
  // multiple exclamation marks → angry
  { pattern: /!{2,}/,                     tone: TONES.ANGRY,      weight: 3 },
  // ALL CAPS word (≥3 chars) → angry
  { pattern: /\b[A-Z]{3,}\b/,            tone: TONES.ANGRY,      weight: 2 },
  // single exclamation → could be friendly or angry — small nudge
  { pattern: /!(?!!)/,                    tone: TONES.ANGRY,      weight: 1 },
  // question mark → casual curiosity
  { pattern: /\?/,                        tone: TONES.CASUAL,     weight: 1 },
  // ellipsis → casual / trailing thought
  { pattern: /\.{2,}|…/,                 tone: TONES.CASUAL,     weight: 1 },
  // emoji-like sequences (basic Unicode emoticons range) → friendly
  { pattern: /[\u{1F600}-\u{1F64F}]/u,   tone: TONES.FRIENDLY,   weight: 2 },
  { pattern: /[\u{1F300}-\u{1F5FF}]/u,   tone: TONES.FRIENDLY,   weight: 1 },
  // heart / star symbols → friendly
  { pattern: /[❤️💕💙🌟⭐✨]/u,           tone: TONES.FRIENDLY,   weight: 2 },
];

// ── LANGUAGE-SPECIFIC KEYWORD BANKS ───────────────────────────────
// Each entry: { words: string[], tone, weight }
// Words are matched as whole tokens (case-insensitive, script-aware).

const LANG_KEYWORDS = {

  // ── Telugu ───────────────────────────────────────────────────
  te: [
    { words: ["ra","ri","bey","babu","nayana","chelli","anna","akkaa"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["enti","em","emiti","ela","cheppu","chuso"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["meeru","miru","daya","chesukoni","please","vinnara","vinandi"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["pashupati","veltava","poru","nee","ikkada ra","ra ikka","inkenti"],
      tone: TONES.ANGRY,      weight: 2 },
    // native script
    { words: ["రా","రి","బేయ్","ఏంటి","మీరు","దయచేసి"],
      tone: TONES.CASUAL,     weight: 1 },
  ],

  // ── Hindi ────────────────────────────────────────────────────
  hi: [
    { words: ["yaar","bhai","arre","dost","buddy","oye","bhaiya"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["kya","kyun","kaise","kab","kahan","matlab"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","kripa","kripaya","aap","aapko","namaste","shukriya","dhanyavaad","ji"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["chup","shut","nikal","jaa","nikl","bol","bata","abhi","turant","chalo"],
      tone: TONES.ANGRY,      weight: 2 },
    // native script
    { words: ["यार","भाई","आप","कृपया","चुप","निकल"],
      tone: TONES.CASUAL,     weight: 1 },
  ],

  // ── Tamil ────────────────────────────────────────────────────
  ta: [
    { words: ["da","di","dei","machan","kanna","pa","ma"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["enna","epdi","yenna","sollu","paru","paaru"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","ungal","ungalukku","nandri","vanakkam","aiya","ayya"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["poda","thollai","vaa","po","di poda","da poda","vidu"],
      tone: TONES.ANGRY,      weight: 2 },
    // native script
    { words: ["டா","டி","மச்சான்","நன்றி","வணக்கம்","போடா"],
      tone: TONES.CASUAL,     weight: 1 },
  ],

  // ── Kannada ──────────────────────────────────────────────────
  kn: [
    { words: ["guru","machaa","bhai","anna","akka","aye"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["yen","yenu","hege","hengide","heli","nodu"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","dayavittu","nimma","nimage","dhanyavada","vanakkam","saar","sir"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["hogri","summane","bidi","pashupati","hogu","bekilla","sullu"],
      tone: TONES.ANGRY,      weight: 2 },
    // native script
    { words: ["ಗುರು","ದಯವಿಟ್ಟು","ನಿಮ್ಮ","ಹೇಳಿ"],
      tone: TONES.CASUAL,     weight: 1 },
  ],

  // ── Malayalam ────────────────────────────────────────────────
  ml: [
    { words: ["mone","mol","chetta","chechi","machaan","da","di"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["enthu","engane","evidey","parayo","nokkku","parayoo"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","dayavayi","ningal","ningalude","nandi","namaskaram","saar"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["poda","thollayedam","thalleda","poyi","povaan","vidu"],
      tone: TONES.ANGRY,      weight: 2 },
    // native script
    { words: ["മോനേ","ദയവായി","നന്ദി","നമസ്കാരം","പോടാ"],
      tone: TONES.CASUAL,     weight: 1 },
  ],

  // ── Bengali ──────────────────────────────────────────────────
  bn: [
    { words: ["bhai","dada","didi","yaar","bondhu","re"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["ki","kemon","kothay","kobe","keno","bolo","dekho"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","dayakore","apni","apnar","dhanyobad","namaskar","saar"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["chupo","ber ho","jao","chol","ei","shono","abhi"],
      tone: TONES.ANGRY,      weight: 2 },
    // native script
    { words: ["ভাই","দাদা","দয়া করে","ধন্যবাদ","যাও"],
      tone: TONES.CASUAL,     weight: 1 },
  ],

  // ── Marathi ──────────────────────────────────────────────────
  mr: [
    { words: ["bhau","dada","yaar","bhai","re","ga","tu"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["kay","kasa","kuthe","kadhi","ka","sang","bagh"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","krupaya","tumhi","tumhala","dhanyavad","namaskar","saar"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["jaao","chup","gappa","jaav","nik","bagh nako"],
      tone: TONES.ANGRY,      weight: 2 },
    // native script
    { words: ["भाऊ","कृपया","तुम्ही","धन्यवाद","जा"],
      tone: TONES.CASUAL,     weight: 1 },
  ],

  // ── Gujarati ─────────────────────────────────────────────────
  gu: [
    { words: ["bhai","yaar","dost","mitro","kem cho","kem"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["su","kem","kya","kyare","kyan","kaho","juo"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","maherbani","aap","aapne","aabhar","jai shree"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["jao","chup","nik","bolo","avaj","abad"],
      tone: TONES.ANGRY,      weight: 2 },
    // native script
    { words: ["ભાઈ","મહેરબાની","આભાર","જાઓ"],
      tone: TONES.CASUAL,     weight: 1 },
  ],

  // ── Punjabi ──────────────────────────────────────────────────
  pa: [
    { words: ["yaar","paaji","oye","bhai","veer","penji","dost"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["ki","kive","kiddan","dasso","dassi","vekho","sun"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","meharbaani","tussi","tuhade","shukriya","waheguru","satsriakal"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["jao","chup","nikal","bol","chad","hatoo"],
      tone: TONES.ANGRY,      weight: 2 },
    // native script
    { words: ["ਯਾਰ","ਪਾਜੀ","ਮਿਹਰਬਾਨੀ","ਜਾਓ"],
      tone: TONES.CASUAL,     weight: 1 },
  ],

  // ── Urdu ─────────────────────────────────────────────────────
  ur: [
    { words: ["yaar","bhai","dost","jaan","oye"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["kya","kaise","kyun","kab","kahan","bolo","batao"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","meharbani","aap","aapko","shukriya","adaab","janab","sahib"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["chup","nikal","jao","bol","abhi","fillhal"],
      tone: TONES.ANGRY,      weight: 2 },
  ],

  // ── Odia ─────────────────────────────────────────────────────
  or: [
    { words: ["bhai","didi","yaar","re","hela"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["ki","kemiti","kebe","kahim","kaha","bolo","dekha"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","daya kari","aapana","dhanyabad","namaskar"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["jaa","chupa","ber ho","bolo","ini"],
      tone: TONES.ANGRY,      weight: 2 },
  ],

  // ── Assamese ─────────────────────────────────────────────────
  as: [
    { words: ["bhai","dada","didi","yaar","bou"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["ki","kene","kat","kot","kobo","saba"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","onugroho","apunar","dhanyabad","namaskar"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["jaa","chupa","ber ho"],
      tone: TONES.ANGRY,      weight: 2 },
  ],

  // ── Nepali ───────────────────────────────────────────────────
  ne: [
    { words: ["dai","bhai","yaar","didi","sathi"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["ke","kasari","kahile","kahan","bata","hera"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","kripaya","tapai","tapailai","dhanyabad","namaskar"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["jaa","chup","nikal","bol","abhi"],
      tone: TONES.ANGRY,      weight: 2 },
  ],

  // ── Bhojpuri ─────────────────────────────────────────────────
  bho: [
    { words: ["bhai","yaar","dost","bhaiya","re"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["ka ba","ki","kaise","kab","kahan","bolo"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","bhaiya","sahib","dhanyawad","namaskar"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["chup","jaa","nik","bol"],
      tone: TONES.ANGRY,      weight: 2 },
  ],

  // ── Haryanvi ─────────────────────────────────────────────────
  bgc: [
    { words: ["bhai","yaar","arre","oye"],
      tone: TONES.FRIENDLY,   weight: 2 },
    { words: ["ke","kaise","kab","kahan","bol"],
      tone: TONES.CASUAL,     weight: 1 },
    { words: ["please","aap","shukriya","namaskar"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["chup","jaa","nik","ab"],
      tone: TONES.ANGRY,      weight: 2 },
  ],

  // ── Generic fallback applied to all languages ─────────────────
  _common: [
    { words: ["please","kindly","request","sorry","excuse","thank","thanks","regards"],
      tone: TONES.RESPECTFUL, weight: 2 },
    { words: ["hi","hello","hey","sup","yo"],
      tone: TONES.FRIENDLY,   weight: 1 },
    { words: ["come here","stop","now","immediately","right now","shut up","get out","go away"],
      tone: TONES.ANGRY,      weight: 3 },
    { words: ["lol","haha","lmao","rofl","hehe","😂","🤣"],
      tone: TONES.CASUAL,     weight: 2 },
    { words: ["okay","ok","fine","sure","alright","noted"],
      tone: TONES.NEUTRAL,    weight: 1 },
  ],
};

// ── HELPERS ────────────────────────────────────────────────────────

/**
 * Tokenise text into lowercase words.
 * Works for both Latin-script and native Indian scripts.
 */
function tokenise(text) {
  // Split on whitespace and common punctuation, keep script chars intact
  return text
    .toLowerCase()
    .split(/[\s\u200b\u200c\u200d\ufeff,;:।॥\u0964\u0965]+/)
    .map(t => t.replace(/^[!?.…\-–—"'()\[\]]+|[!?.…\-–—"'()\[\]]+$/g, ""))
    .filter(t => t.length > 0);
}

/**
 * Add weight to a score map.
 */
function addScore(scores, tone, weight) {
  scores[tone] = (scores[tone] || 0) + weight;
}

/**
 * Pick the tone with the highest score; tie-break to NEUTRAL.
 */
function winningTone(scores) {
  let best = TONES.NEUTRAL;
  let bestScore = 0;
  for (const [tone, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = tone;
    }
  }
  return best;
}

// ── MAIN EXPORT ────────────────────────────────────────────────────

/**
 * Detect the emotional tone of `text` in language `lang`.
 *
 * @param {string} text  - Input text (any script or romanized)
 * @param {string} lang  - Language code matching LANG_CONFIG (e.g. "te","hi","ta")
 * @returns {"friendly"|"angry"|"casual"|"respectful"|"neutral"}
 */
export function detectTone(text, lang) {
  if (!text || typeof text !== "string") return TONES.NEUTRAL;

  const trimmed = text.trim();
  if (!trimmed) return TONES.NEUTRAL;

  const scores = {};

  // ── 1. Punctuation & casing signals ───────────────────────────
  for (const rule of PUNCT_RULES) {
    if (rule.pattern.test(trimmed)) {
      addScore(scores, rule.tone, rule.weight);
    }
  }

  // ── 2. Tokenise ────────────────────────────────────────────────
  const tokens = tokenise(trimmed);
  const tokenSet = new Set(tokens);

  // ── 3. Language-specific keyword matching ──────────────────────
  const langRules = LANG_KEYWORDS[lang] || [];
  for (const rule of langRules) {
    for (const word of rule.words) {
      if (tokenSet.has(word.toLowerCase())) {
        addScore(scores, rule.tone, rule.weight);
        break; // one match per rule group is enough
      }
    }
  }

  // ── 4. Common cross-language keywords ──────────────────────────
  for (const rule of LANG_KEYWORDS._common) {
    for (const phrase of rule.words) {
      const p = phrase.toLowerCase();
      // Handle multi-word phrases
      if (p.includes(" ")) {
        if (trimmed.toLowerCase().includes(p)) {
          addScore(scores, rule.tone, rule.weight);
          break;
        }
      } else if (tokenSet.has(p)) {
        addScore(scores, rule.tone, rule.weight);
        break;
      }
    }
  }

  // ── 5. Slang dictionary tone signals ──────────────────────────
  const slangDict = getSlangForLang(lang);
  for (const token of tokens) {
    const entry = slangDict[token];
    if (entry?.tone) {
      // Map slang tones to our tone constants
      const toneMap = {
        friendly:     TONES.FRIENDLY,
        casual:       TONES.CASUAL,
        informal:     TONES.CASUAL,
        affectionate: TONES.FRIENDLY,
        exclamatory:  TONES.FRIENDLY,
        humorous:     TONES.CASUAL,
        derogatory:   TONES.ANGRY,
        formal:       TONES.RESPECTFUL,
        neutral:      TONES.NEUTRAL,
      };
      const mapped = toneMap[entry.tone];
      if (mapped) addScore(scores, mapped, 1);
    }
  }

  // ── 6. Structural heuristics ───────────────────────────────────
  // Short imperative-style text (≤4 tokens, no polite words) → casual/angry
  if (tokens.length <= 4 && !scores[TONES.RESPECTFUL]) {
    addScore(scores, TONES.CASUAL, 0.5);
  }

  // Long text with commas / conjunctions → neutral/respectful
  if (tokens.length > 12) {
    addScore(scores, TONES.NEUTRAL, 1);
  }

  return winningTone(scores);
}

/**
 * Detect tone and return a full result object with scores (useful for debugging).
 *
 * @param {string} text
 * @param {string} lang
 * @returns {{ tone: string, scores: Record<string, number>, tokens: string[] }}
 */
export function detectToneDetailed(text, lang) {
  if (!text || typeof text !== "string") {
    return { tone: TONES.NEUTRAL, scores: {}, tokens: [] };
  }

  const trimmed  = text.trim();
  const scores   = {};
  const tokens   = tokenise(trimmed);
  const tokenSet = new Set(tokens);

  for (const rule of PUNCT_RULES) {
    if (rule.pattern.test(trimmed)) addScore(scores, rule.tone, rule.weight);
  }

  const langRules = LANG_KEYWORDS[lang] || [];
  for (const rule of langRules) {
    for (const word of rule.words) {
      if (tokenSet.has(word.toLowerCase())) { addScore(scores, rule.tone, rule.weight); break; }
    }
  }

  for (const rule of LANG_KEYWORDS._common) {
    for (const phrase of rule.words) {
      const p = phrase.toLowerCase();
      if (p.includes(" ")) {
        if (trimmed.toLowerCase().includes(p)) { addScore(scores, rule.tone, rule.weight); break; }
      } else if (tokenSet.has(p)) {
        addScore(scores, rule.tone, rule.weight); break;
      }
    }
  }

  const slangDict = getSlangForLang(lang);
  for (const token of tokens) {
    const entry = slangDict[token];
    if (entry?.tone) {
      const toneMap = {
        friendly: TONES.FRIENDLY, casual: TONES.CASUAL, informal: TONES.CASUAL,
        affectionate: TONES.FRIENDLY, exclamatory: TONES.FRIENDLY, humorous: TONES.CASUAL,
        derogatory: TONES.ANGRY, formal: TONES.RESPECTFUL, neutral: TONES.NEUTRAL,
      };
      const mapped = toneMap[entry.tone];
      if (mapped) addScore(scores, mapped, 1);
    }
  }

  if (tokens.length <= 4 && !scores[TONES.RESPECTFUL]) addScore(scores, TONES.CASUAL, 0.5);
  if (tokens.length > 12) addScore(scores, TONES.NEUTRAL, 1);

  return { tone: winningTone(scores), scores, tokens };
}
