/**
 * Vaani — slangDictionary.js
 * ═══════════════════════════════════════════════════════════════════
 * Multi-language slang/colloquial dictionary for all Indian languages.
 *
 * Structure per entry:
 *   "slang": {
 *     meaning : string   — normalized English meaning
 *     tone    : string   — "friendly" | "casual" | "informal" | "affectionate"
 *                          | "exclamatory" | "derogatory" | "humorous" | "neutral"
 *     usage   : string?  — optional short usage note
 *   }
 *
 * To add a new language:  add a new top-level key matching LANG_CONFIG codes.
 * To add entries:         add key-value pairs inside the language object.
 * ═══════════════════════════════════════════════════════════════════
 */

export const slangMap = {

  // ── Telugu ─────────────────────────────────────────────────────
  te: {
    "ra":        { meaning: "bro / hey (masculine)",  tone: "casual",       usage: "Used to address male friends" },
    "ri":        { meaning: "hey (feminine)",          tone: "casual",       usage: "Used to address female friends" },
    "bey":       { meaning: "bro / dude",              tone: "casual" },
    "nayana":    { meaning: "darling / dear",          tone: "affectionate" },
    "babu":      { meaning: "buddy / dear",            tone: "affectionate" },
    "enti":      { meaning: "what / what's up",        tone: "casual" },
    "chala":     { meaning: "very / a lot",            tone: "informal" },
    "ledu":      { meaning: "no / nothing",            tone: "neutral" },
    "ayindi":    { meaning: "it's done / happened",    tone: "neutral" },
    "poru":      { meaning: "leave it / forget it",    tone: "casual" },
    "gurrram":   { meaning: "wow / expression of awe", tone: "exclamatory" },
    "abbaa":     { meaning: "oh wow / phew",           tone: "exclamatory" },
    "tondara":   { meaning: "hurry up",                tone: "informal" },
    "dabbu":     { meaning: "money",                   tone: "informal" },
    "jagratta":  { meaning: "be careful",              tone: "informal" },
  },

  // ── Hindi ──────────────────────────────────────────────────────
  hi: {
    "yaar":      { meaning: "friend / bro",            tone: "friendly" },
    "bhai":      { meaning: "bro / brother",           tone: "friendly" },
    "arre":      { meaning: "hey / oh",                tone: "exclamatory" },
    "kyun re":   { meaning: "why bro",                 tone: "casual" },
    "kya scene": { meaning: "what's up / what's going on", tone: "casual" },
    "bindaas":   { meaning: "carefree / cool",         tone: "informal" },
    "jugaad":    { meaning: "hack / workaround",       tone: "humorous" },
    "dhamaal":   { meaning: "fun / chaos",             tone: "informal" },
    "mast":      { meaning: "awesome / great",         tone: "casual" },
    "bakwaas":   { meaning: "nonsense",                tone: "casual" },
    "changa":    { meaning: "fine / good",             tone: "friendly",     usage: "Common in North India" },
    "lafda":     { meaning: "trouble / mess",          tone: "informal" },
    "timepass":  { meaning: "killing time / flirting", tone: "humorous" },
    "jaldi kar": { meaning: "hurry up",                tone: "informal" },
    "paisa":     { meaning: "money",                   tone: "neutral" },
  },

  // ── Tamil ──────────────────────────────────────────────────────
  ta: {
    "da":        { meaning: "bro (masculine)",         tone: "casual" },
    "di":        { meaning: "hey (feminine)",          tone: "casual" },
    "dei":       { meaning: "hey / dude",              tone: "casual" },
    "machan":    { meaning: "bro / dude",              tone: "friendly" },
    "aama":      { meaning: "yes / yeah",              tone: "casual" },
    "illa":      { meaning: "no / nope",               tone: "casual" },
    "enna da":   { meaning: "what bro / what's up",    tone: "casual" },
    "super da":  { meaning: "awesome bro",             tone: "exclamatory" },
    "semma":     { meaning: "awesome / superb",        tone: "informal" },
    "poda":      { meaning: "get lost (mild)",         tone: "casual" },
    "vera level":{ meaning: "next level / amazing",    tone: "informal" },
    "kusu":      { meaning: "small / tiny",            tone: "humorous" },
    "paathukko": { meaning: "take care / be careful",  tone: "friendly" },
    "kadaisi":   { meaning: "last / final",            tone: "neutral" },
  },

  // ── Kannada ────────────────────────────────────────────────────
  kn: {
    "guru":      { meaning: "bro / dude",              tone: "friendly" },
    "yen guru":  { meaning: "what's up bro",           tone: "casual" },
    "bekilla":   { meaning: "don't need it / no thanks", tone: "casual" },
    "hogbidi":   { meaning: "leave it / forget it",    tone: "casual" },
    "sahi":      { meaning: "correct / right",         tone: "neutral" },
    "machaa":    { meaning: "bro / buddy",             tone: "friendly" },
    "onde kathe":{ meaning: "same story",              tone: "humorous" },
    "henge ido": { meaning: "how are you",             tone: "friendly" },
    "sullu":     { meaning: "lie / fake",              tone: "informal" },
    "bega":      { meaning: "quickly / fast",          tone: "informal" },
  },

  // ── Malayalam ──────────────────────────────────────────────────
  ml: {
    "mone":      { meaning: "son / bro (affectionate)",tone: "affectionate" },
    "mol":       { meaning: "girl / dear (affectionate)", tone: "affectionate" },
    "chetta":    { meaning: "bro / elder brother",     tone: "friendly" },
    "myru":      { meaning: "damn / expression",       tone: "casual" },
    "adipoli":   { meaning: "awesome / excellent",     tone: "exclamatory" },
    "poda":      { meaning: "get lost (mild)",         tone: "casual" },
    "machaan":   { meaning: "bro / buddy",             tone: "friendly" },
    "enthu":     { meaning: "what",                    tone: "casual" },
    "sheri":     { meaning: "okay / alright",          tone: "casual" },
    "enthaa":    { meaning: "what's the matter",       tone: "casual" },
    "thalleda":  { meaning: "nonsense / not true",     tone: "informal" },
  },

  // ── Bengali ────────────────────────────────────────────────────
  bn: {
    "bhai":      { meaning: "bro / brother",           tone: "friendly" },
    "dada":      { meaning: "elder bro / sir",         tone: "friendly" },
    "yaar":      { meaning: "friend",                  tone: "friendly" },
    "ki re":     { meaning: "what's up bro",           tone: "casual" },
    "jhol":      { meaning: "mess / complicated",      tone: "informal" },
    "taka":      { meaning: "money",                   tone: "neutral" },
    "faka":      { meaning: "free / empty",            tone: "casual" },
    "thik ache": { meaning: "okay / alright",          tone: "casual" },
    "pagol":     { meaning: "crazy (light)",           tone: "humorous" },
    "bhalo":     { meaning: "good / nice",             tone: "neutral" },
  },

  // ── Marathi ────────────────────────────────────────────────────
  mr: {
    "bhau":      { meaning: "bro / brother",           tone: "friendly" },
    "dada":      { meaning: "elder bro / boss",        tone: "friendly" },
    "aaichi go": { meaning: "oh wow (exclamation)",    tone: "exclamatory" },
    "bhaari":    { meaning: "heavy / awesome",         tone: "informal" },
    "dhanda":    { meaning: "business / work",         tone: "neutral" },
    "kharach":   { meaning: "really / truly",          tone: "casual" },
    "chaan":     { meaning: "nice / good",             tone: "casual" },
    "ghanta":    { meaning: "not at all / zero",       tone: "informal" },
    "fokat":     { meaning: "free of cost",            tone: "humorous" },
  },

  // ── Gujarati ───────────────────────────────────────────────────
  gu: {
    "bhai":      { meaning: "bro / brother",           tone: "friendly" },
    "yaar":      { meaning: "friend / bro",            tone: "friendly" },
    "kevi rit":  { meaning: "how come / really?",      tone: "casual" },
    "hu chu":    { meaning: "I'm here / I exist",      tone: "humorous" },
    "gando":     { meaning: "crazy (light)",           tone: "humorous" },
    "mast":      { meaning: "awesome / great",         tone: "casual" },
    "dhama":     { meaning: "fun / party",             tone: "informal" },
    "paise":     { meaning: "money",                   tone: "neutral" },
  },

  // ── Punjabi ────────────────────────────────────────────────────
  pa: {
    "yaar":      { meaning: "friend / bro",            tone: "friendly" },
    "paaji":     { meaning: "elder bro / bro",         tone: "friendly" },
    "oye":       { meaning: "hey / yo",                tone: "casual" },
    "ki haal":   { meaning: "how are you / what's up", tone: "casual" },
    "sanu ki":   { meaning: "so what / not my problem",tone: "casual" },
    "shabaash":  { meaning: "well done / bravo",       tone: "exclamatory" },
    "chad yaar": { meaning: "leave it bro",            tone: "casual" },
    "dil da raja":{ meaning: "king of hearts / cool person", tone: "humorous" },
    "jugaad":    { meaning: "hack / workaround",       tone: "humorous" },
    "panga":     { meaning: "trouble / fight",         tone: "informal" },
  },

  // ── Urdu ───────────────────────────────────────────────────────
  ur: {
    "yaar":      { meaning: "friend / bro",            tone: "friendly" },
    "bhai":      { meaning: "bro / brother",           tone: "friendly" },
    "arre":      { meaning: "hey / oh",                tone: "exclamatory" },
    "janab":     { meaning: "sir / respected one",     tone: "formal" },
    "mast":      { meaning: "awesome / great",         tone: "casual" },
    "bakwaas":   { meaning: "nonsense",                tone: "casual" },
    "zabardast":  { meaning: "amazing / powerful",     tone: "exclamatory" },
    "waise":     { meaning: "by the way / generally",  tone: "neutral" },
  },

  // ── Odia ───────────────────────────────────────────────────────
  or: {
    "bhai":      { meaning: "bro",                     tone: "friendly" },
    "bhauja":    { meaning: "sister-in-law (casual address)", tone: "friendly" },
    "didi":      { meaning: "elder sister",            tone: "affectionate" },
    "ki khobor": { meaning: "what's the news / what's up", tone: "casual" },
    "thik achi": { meaning: "it's fine / okay",        tone: "casual" },
    "paka":      { meaning: "exact / true",            tone: "neutral" },
  },

  // ── Assamese ───────────────────────────────────────────────────
  as: {
    "bhai":      { meaning: "bro",                     tone: "friendly" },
    "dada":      { meaning: "elder bro",               tone: "friendly" },
    "ki khobor": { meaning: "what's up",               tone: "casual" },
    "bhaal":     { meaning: "good / fine",             tone: "neutral" },
    "jordar":    { meaning: "awesome / powerful",      tone: "exclamatory" },
  },

  // ── Nepali ─────────────────────────────────────────────────────
  ne: {
    "dai":       { meaning: "elder bro",               tone: "friendly" },
    "bhai":      { meaning: "bro / younger bro",       tone: "friendly" },
    "yaar":      { meaning: "friend / bro",            tone: "friendly" },
    "ke cha":    { meaning: "what's up / how is it",   tone: "casual" },
    "sanchai":   { meaning: "okay / alright",          tone: "casual" },
    "chatpat":   { meaning: "quickly / immediately",   tone: "informal" },
    "jhyaure":   { meaning: "lazy / slow person",      tone: "humorous" },
  },

  // ── Sanskrit ───────────────────────────────────────────────────
  sa: {},

  // ── Sindhi ─────────────────────────────────────────────────────
  sd: {
    "yaar":      { meaning: "friend / bro",            tone: "friendly" },
    "bhai":      { meaning: "bro / brother",           tone: "friendly" },
  },

  // ── Maithili ───────────────────────────────────────────────────
  mai: {
    "bhai":      { meaning: "bro",                     tone: "friendly" },
    "yaar":      { meaning: "friend",                  tone: "friendly" },
  },

  // ── Dogri ──────────────────────────────────────────────────────
  doi: {},

  // ── Konkani ────────────────────────────────────────────────────
  kok: {
    "bhai":      { meaning: "bro",                     tone: "friendly" },
  },

  // ── Goan Konkani ───────────────────────────────────────────────
  gom: {
    "bhai":      { meaning: "bro",                     tone: "friendly" },
  },

  // ── Bodo ───────────────────────────────────────────────────────
  brx: {},

  // ── Manipuri (Meitei) ──────────────────────────────────────────
  "mni-Mtei": {},

  // ── Santali ────────────────────────────────────────────────────
  sat: {},

  // ── Kashmiri ───────────────────────────────────────────────────
  ks: {
    "yaar":      { meaning: "friend / bro",            tone: "friendly" },
  },

  // ── Bhojpuri ───────────────────────────────────────────────────
  bho: {
    "bhai":      { meaning: "bro",                     tone: "friendly" },
    "yaar":      { meaning: "friend",                  tone: "friendly" },
    "arre":      { meaning: "hey / oh",                tone: "exclamatory" },
    "ka ba":     { meaning: "what's up / what is it",  tone: "casual" },
    "baa":       { meaning: "yep / okay",              tone: "casual" },
  },

  // ── Marwari ────────────────────────────────────────────────────
  mwr: {
    "bhai":      { meaning: "bro",                     tone: "friendly" },
    "sa":        { meaning: "sir / respected (suffix)",tone: "friendly" },
  },

  // ── Tulu ───────────────────────────────────────────────────────
  tcy: {
    "bhai":      { meaning: "bro",                     tone: "friendly" },
    "ayya":      { meaning: "sir / elder bro",         tone: "friendly" },
  },

  // ── Mizo (Lushai) ──────────────────────────────────────────────
  lus: {
    "bro":       { meaning: "bro",                     tone: "friendly" },
    "pa":        { meaning: "father / elder male",     tone: "affectionate" },
  },

  // ── Awadhi ─────────────────────────────────────────────────────
  awa: {
    "bhai":      { meaning: "bro",                     tone: "friendly" },
    "yaar":      { meaning: "friend",                  tone: "friendly" },
  },

  // ── Magahi ─────────────────────────────────────────────────────
  mag: {
    "bhai":      { meaning: "bro",                     tone: "friendly" },
    "yaar":      { meaning: "friend",                  tone: "friendly" },
  },

  // ── Chhattisgarhi ──────────────────────────────────────────────
  hne: {
    "bhai":      { meaning: "bro",                     tone: "friendly" },
    "yaar":      { meaning: "friend",                  tone: "friendly" },
  },

  // ── Haryanvi ───────────────────────────────────────────────────
  bgc: {
    "bhai":      { meaning: "bro",                     tone: "friendly" },
    "yaar":      { meaning: "friend",                  tone: "friendly" },
    "arre":      { meaning: "hey / oh",                tone: "exclamatory" },
    "mhara":     { meaning: "my / mine (Haryanvi)",    tone: "casual" },
  },

  // ── Rajasthani (Marwari) ───────────────────────────────────────
  raj: {
    "bhai":      { meaning: "bro",                     tone: "friendly" },
    "yaar":      { meaning: "friend",                  tone: "friendly" },
    "sa":        { meaning: "sir / respected (suffix)",tone: "friendly" },
    "kem cho":   { meaning: "how are you",             tone: "casual" },
  },

  // ── Khasi ──────────────────────────────────────────────────────
  kha: {
    "bro":       { meaning: "bro",                     tone: "friendly" },
    "kong":      { meaning: "ma'am / elder woman",     tone: "friendly" },
    "u":         { meaning: "he / the (informal address)", tone: "neutral" },
  },

  // ── Lepcha ─────────────────────────────────────────────────────
  lep: {},

  // ── English (Indian colloquial) ────────────────────────────────
  en: {
    "yaar":      { meaning: "friend / bro (Indian English)", tone: "friendly" },
    "bhai":      { meaning: "bro / brother (Indian English)", tone: "friendly" },
    "timepass":  { meaning: "killing time",            tone: "humorous" },
    "jugaad":    { meaning: "hack / workaround",       tone: "humorous" },
    "bindaas":   { meaning: "carefree / cool",         tone: "informal" },
    "prepone":   { meaning: "move earlier (Indian English)", tone: "neutral" },
    "only":      { meaning: "emphasis suffix (Indian English)", tone: "informal", usage: "'I told you only'" },
    "itself":    { meaning: "emphasis (Indian English)", tone: "informal", usage: "'It happened itself'" },
    "do one thing": { meaning: "suggestion opener",    tone: "casual" },
    "out of station": { meaning: "out of town",        tone: "neutral" },
    "good name": { meaning: "what is your name",       tone: "formal" },
    "Eve teasing":{ meaning: "street harassment",      tone: "neutral" },
  },
};

/**
 * Look up a slang word for a given language.
 * Returns the entry or null if not found.
 *
 * @param {string} lang  - Language code (e.g. "te", "hi")
 * @param {string} word  - Slang word to look up (case-insensitive)
 * @returns {{ meaning: string, tone: string, usage?: string } | null}
 */
export function lookupSlang(lang, word) {
  if (!lang || !word) return null;
  const dict = slangMap[lang];
  if (!dict) return null;
  const key = word.trim().toLowerCase();
  return dict[key] || null;
}

/**
 * Check if a word is slang in a given language.
 *
 * @param {string} lang
 * @param {string} word
 * @returns {boolean}
 */
export function isSlang(lang, word) {
  return lookupSlang(lang, word) !== null;
}

/**
 * Get all slang entries for a language.
 *
 * @param {string} lang
 * @returns {Record<string, { meaning: string, tone: string, usage?: string }>}
 */
export function getSlangForLang(lang) {
  return slangMap[lang] || {};
}

/**
 * Get all supported language codes that have slang data.
 *
 * @returns {string[]}
 */
export function getSupportedLangs() {
  return Object.keys(slangMap).filter(lang => Object.keys(slangMap[lang]).length > 0);
}
