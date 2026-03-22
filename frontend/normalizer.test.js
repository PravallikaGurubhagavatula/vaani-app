/**
 * ============================================================
 *  VAANI — Universal Indian Language Normalization Engine
 *  normalizer.js  |  v1.0.0  |  Pure JS, zero dependencies
 * ============================================================
 *
 *  Supports all Indian languages typed in English (Romanised):
 *  Telugu, Hindi, Tamil, Kannada, Malayalam, Marathi, Bengali,
 *  Gujarati, Punjabi, Odia, Assamese, Urdu, Maithili, Nepali,
 *  Santali, Kashmiri, Dogri, Sindhi, Konkani, Bodo, Manipuri,
 *  Sanskrit, Bhojpuri, Tulu, Marwari, Mizo, Awadhi,
 *  Chhattisgarhi, Haryanvi, Khasi, Rajasthani + tribal langs.
 *
 *  Pipeline:
 *    1. cleanText()           – whitespace, punctuation, case
 *    2. normalizePhonetics()  – vowel/consonant universal rules
 *    3. normalizeShortcuts()  – chat shortcuts (lang-aware)
 *    4. normalizeByLanguage() – lang-specific light fixes
 *    5. safeMode guard        – abort on low-confidence changes
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
//  SECTION 1 — CLEAN TEXT
// ─────────────────────────────────────────────────────────────

/**
 * cleanText(text)
 * • Lowercase
 * • Collapse internal whitespace
 * • Strip punctuation except ? and !
 * • Deduplicate trailing ! and ?
 */
function cleanText(text) {
  if (typeof text !== "string") return "";

  return text
    .toLowerCase()
    .trim()
    // collapse multiple spaces / tabs / newlines
    .replace(/\s+/g, " ")
    // remove characters that are not word chars, spaces, ? or !
    .replace(/[^\w\s?!]/g, "")
    // collapse repeated ! or ? (e.g. ??? → ?)
    .replace(/!{2,}/g, "!")
    .replace(/\?{2,}/g, "?")
    .trim();
}

// ─────────────────────────────────────────────────────────────
//  SECTION 2 — UNIVERSAL PHONETIC NORMALIZATION
// ─────────────────────────────────────────────────────────────

/**
 * Ordered list of universal phonetic replacement rules.
 * Each rule is [regex, replacement].
 * ORDER MATTERS — more specific rules come first.
 *
 * Safety philosophy:
 *   - Rules are word-boundary aware where possible.
 *   - No rule collapses distinct consonant clusters
 *     that carry meaning differences in Indian languages.
 */
const UNIVERSAL_PHONETIC_RULES = [
  // ── Repeated characters (run-length compress) ──────────────
  // e.g. goooood → good, noooo → no, aaaaaa → a
  // Compress 3+ repeats of ANY char → single char
  [/(.)\1{2,}/g, "$1"],

  // ── Vowel normalisations ───────────────────────────────────
  // aa → a  (baat→bat is intentional; baat already means something)
  // But we only compress WITHIN a word, not across.
  [/aa/g, "a"],
  // ah word-final (lekin-ah → lekin-a) — contextual breathing vowel
  [/ah\b/g, "a"],
  // ee → i  (theek→thik, nahi → nahi stays)
  [/ee/g, "i"],
  // oo → u  (kuch→kuch, doost→dust — safe in romanised context)
  [/oo/g, "u"],
  // ae → e  (paesa→pesa, jaega→jega)
  [/ae/g, "e"],

  // ── Consonant cluster normalisations ──────────────────────
  // ph → f  (photo, phir — note: "phir" stays because 'f' = 'ph' in Hindi)
  [/\bph/g, "f"],
  // kh stays (distinct sound in most Indian langs — do NOT normalise)
  // gh stays (distinct sound)
  // bh → b  (bhaag → baag — approximate; safe for translation)
  [/bh/g, "b"],
  // dh → d  (dhyan → dyan — approximate)
  [/dh/g, "d"],
  // th stays (tha, thi, the — critical in all Indian langs)
  // sh stays (critical)
  // ch stays (critical)

  // ── Common romanisation variants ──────────────────────────
  // iy → i word-final (aadmiy → aadmi)
  [/iy\b/g, "i"],
  // w → v  (very common Indian substitution: waqt → vaqt)
  // Disabled by default — w vs v matters in some dialects
  // [/\bw/g, "v"],
];

/**
 * Words where aa→a would destroy meaning or common usage.
 * These are protected from the aa→a rule.
 * We achieve this with a post-processing restore step.
 */
const AA_PROTECTED = new Set([
  "yaar", "baat", "saath", "aas", "aaj", "raaz", "jaadu",
  "baal", "kaam", "naam", "daam", "shaan", "jaan", "maan",
  "raat", "baat", "gaat", "laat", "khaat",
  "haar", "pyaar", "vyaar", "taar", "baar",
  "chaar", "chaal", "dhaal", "paal", "maal", "saal",
]);

/**
 * normalizePhonetics(text)
 * Applies universal phonetic rules to romanised Indian text.
 * Protected words are restored after transformation.
 */
function normalizePhonetics(text) {
  // First, tokenize and identify protected words
  const tokens = text.split(" ");
  const isProtected = tokens.map(t => AA_PROTECTED.has(t));

  // Apply rules to full string
  let result = text;
  for (const [pattern, replacement] of UNIVERSAL_PHONETIC_RULES) {
    result = result.replace(pattern, replacement);
  }

  // Restore protected tokens
  const resultTokens = result.split(" ");
  for (let i = 0; i < Math.min(tokens.length, resultTokens.length); i++) {
    if (isProtected[i]) resultTokens[i] = tokens[i];
  }
  return resultTokens.join(" ");
}

// ─────────────────────────────────────────────────────────────
//  SECTION 3 — CHAT SHORTCUT NORMALIZATION (Language-Aware)
// ─────────────────────────────────────────────────────────────

/**
 * Shortcuts common across Indian-English chat.
 * Applied ONLY to whole words (word-boundary checks).
 * Format: [wordBoundaryRegex, replacement, applicableLangs | "all"]
 *
 * "all"     = apply for every language
 * ["hi","ur"] = apply only for those lang codes
 *
 * SAFE MODE threshold: if >40% of tokens are changed, abort.
 */
const CHAT_SHORTCUTS = [
  // ── Hindi / Urdu / Hinglish shortcuts ─────────────────────
  { re: /\bkr\b/g,    rep: "kar",   langs: ["hi", "ur", "bho", "awa", "har"] },
  { re: /\brha\b/g,   rep: "raha",  langs: ["hi", "ur", "bho", "awa", "har"] },
  { re: /\brhi\b/g,   rep: "rahi",  langs: ["hi", "ur", "bho"] },
  { re: /\brhe\b/g,   rep: "rahe",  langs: ["hi", "ur", "bho"] },
  { re: /\bh\b/g,     rep: "hai",   langs: ["hi", "ur", "bho", "awa", "har"] },
  { re: /\bkya\b/g,   rep: "kya",   langs: "all" },   // already correct, keep stable
  { re: /\bkyu\b/g,   rep: "kyu",   langs: ["hi", "ur"] },  // keep — kyun variant
  { re: /\bmujhe\b/g, rep: "mujhe", langs: "all" },
  { re: /\bnhi\b/g,   rep: "nahi",  langs: ["hi", "ur", "bho"] },
  { re: /\bnai\b/g,   rep: "nahi",  langs: ["hi", "ur"] },
  { re: /\bmat\b/g,   rep: "mat",   langs: "all" },   // stable
  { re: /\bacha\b/g,  rep: "acha",  langs: "all" },   // stable
  { re: /\btk\b/g,    rep: "tak",   langs: ["hi", "ur"] },
  { re: /\bkl\b/g,    rep: "kal",   langs: ["hi", "ur"] },
  { re: /\bbl\b/g,    rep: "bol",   langs: ["hi", "ur"] },
  { re: /\bbtao\b/g,  rep: "batao", langs: ["hi", "ur"] },
  { re: /\bkro\b/g,   rep: "karo",  langs: ["hi", "ur"] },
  { re: /\bdkh\b/g,   rep: "dekh",  langs: ["hi", "ur"] },

  // ── Telugu shortcuts ───────────────────────────────────────
  { re: /\bchp\b/g,   rep: "cheppu", langs: ["te"] },
  { re: /\bchpi\b/g,  rep: "cheppindi", langs: ["te"] },
  { re: /\bcheppu\b/g,rep: "cheppu",langs: "all" },  // stable
  { re: /\bnvv\b/g,   rep: "nuvvu", langs: ["te"] },
  { re: /\bnuv\b/g,   rep: "nuvvu", langs: ["te"] },
  { re: /\banni\b/g,  rep: "anni",  langs: "all" },  // stable
  { re: /\bendi\b/g,  rep: "endi",  langs: "all" },  // stable

  // ── Tamil shortcuts ────────────────────────────────────────
  { re: /\bpnra\b/g,  rep: "panra", langs: ["ta"] },
  { re: /\bpnren\b/g, rep: "panren",langs: ["ta"] },
  { re: /\bvra\b/g,   rep: "vara",  langs: ["ta"] },
  { re: /\bporu\b/g,  rep: "poru",  langs: "all" },  // stable

  // ── Kannada shortcuts ──────────────────────────────────────
  { re: /\bidhya\b/g, rep: "idya",  langs: ["kn"] },
  { re: /\bhwu\b/g,   rep: "hau",   langs: ["kn"] },

  // ── Malayalam shortcuts ────────────────────────────────────
  { re: /\bentha\b/g, rep: "entha", langs: "all" },  // stable
  { re: /\bchyya\b/g, rep: "cheya", langs: ["ml"] },

  // ── Bengali shortcuts ──────────────────────────────────────
  { re: /\bkrchi\b/g, rep: "korchi",langs: ["bn"] },
  { re: /\bhbe\b/g,   rep: "hobe",  langs: ["bn"] },
  { re: /\bkrbo\b/g,  rep: "korbo", langs: ["bn"] },

  // ── Marathi shortcuts ──────────────────────────────────────
  { re: /\bkrtoy\b/g, rep: "kartoy",langs: ["mr"] },
  { re: /\bhoy\b/g,   rep: "hoy",   langs: "all" },  // stable

  // ── Gujarati shortcuts ─────────────────────────────────────
  { re: /\bchu\b/g,   rep: "chhu",  langs: ["gu"] },
  { re: /\bchhe\b/g,  rep: "chhe",  langs: "all" },  // stable

  // ── Punjabi shortcuts ──────────────────────────────────────
  { re: /\bkrda\b/g,  rep: "karda", langs: ["pa"] },
  { re: /\bkrdi\b/g,  rep: "kardi", langs: ["pa"] },
  { re: /\bkita\b/g,  rep: "kita",  langs: "all" },  // stable

  // ── Universal English-intent shortcuts ─────────────────────
  // Only expand 'u' → 'you' when context suggests English
  // (handled separately in normalizeShortcuts with detection)
  { re: /\br\b/g,     rep: "are",   langs: ["en"] },
  { re: /\bm\b/g,     rep: "am",    langs: ["en"] },
];

/**
 * detectEnglishIntent(tokens)
 * Heuristic: if >50% tokens are common English words, treat as English.
 */
const COMMON_ENGLISH_WORDS = new Set([
  "i","me","my","you","your","we","our","they","their","it","is","are","was",
  "were","have","has","had","be","been","being","do","does","did","will","would",
  "can","could","should","the","a","an","and","or","but","in","on","at","to",
  "for","of","with","not","no","yes","so","that","this","what","how","when",
  "where","who","why","am","if","then","than","just","like","go","come","get",
  "make","see","know","think","want","need","feel","tell","say","use","find",
  "give","take","keep","let","put","seem","even","here","there","also","now",
]);

function detectEnglishIntent(tokens) {
  if (!tokens.length) return false;
  const matched = tokens.filter(t => COMMON_ENGLISH_WORDS.has(t)).length;
  return matched / tokens.length > 0.5;
}

/**
 * normalizeShortcuts(text, sourceLang)
 * Applies language-aware chat shortcut expansion.
 */
function normalizeShortcuts(text, sourceLang) {
  const lang = (sourceLang || "").toLowerCase().trim();
  const tokens = text.split(" ");
  const isEnglish = detectEnglishIntent(tokens);

  let result = text;
  for (const rule of CHAT_SHORTCUTS) {
    const applicable =
      rule.langs === "all" ||
      rule.langs.includes(lang) ||
      (lang === "en" && rule.langs.includes("en")) ||
      (isEnglish && rule.langs.includes("en"));

    if (applicable) {
      result = result.replace(rule.re, rule.rep);
    }
  }

  // Expand 'u' → 'you' only when English intent confirmed
  if (isEnglish || lang === "en") {
    result = result.replace(/\bu\b/g, "you");
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
//  SECTION 4 — LANGUAGE-SPECIFIC LIGHT NORMALIZATION
// ─────────────────────────────────────────────────────────────

/**
 * Language-specific phonetic variant maps.
 * Format: langCode → [ [regex, replacement], ... ]
 *
 * Philosophy: ONLY fix well-known romanisation typos/variants.
 * Do NOT attempt grammar correction or semantic changes.
 */
const LANG_RULES = {

  // ── Telugu (te) ────────────────────────────────────────────
  te: [
    // emi / em → em (question word: "what")
    [/\bemi\b/g, "em"],
    // jargindi / jarigndi / jarigindi variants → jarigindi
    [/\bjar[iy]?g[iy]?ndi\b/g, "jarigindi"],
    [/\bjargindi\b/g, "jarigindi"],
    // ela variations
    [/\byelaa?\b/g, "ela"],
    // nuvvu variations
    [/\bnuvwu\b/g, "nuvvu"],
    // chestunnav variations
    [/\bchestunav\b/g, "chestunnav"],
    [/\bchestunna\b/g, "chestunna"],
    // ledu → ledu (stable — keep)
    // antav variations
    [/\bantavu\b/g, "antav"],
    // meeru / miru → meeru
    [/\bmiru\b/g, "meeru"],
    // undi → undi (stable)
    // chupinchu variations
    [/\bchupincu\b/g, "chupinchu"],
    // okka → okka (stable)
    // kavali → kavali (stable)
    // poindi / poyindi
    [/\bpoyindi\b/g, "poindi"],
    // vachadu / vaccadu
    [/\bvaccadu\b/g, "vachadu"],
    // cheppindi / chepindi
    [/\bchepindi\b/g, "cheppindi"],
    // telugu particle -ni normalized
    [/\bni\b/g, "ni"],
    // telusaa / telusa → telusaa
    [/\btelusa\b/g, "telusaa"],
  ],

  // ── Hindi (hi) ────────────────────────────────────────────
  hi: [
    // karna/karna variations
    [/\bkrna\b/g, "karna"],
    // chahiye variations
    [/\bchahie\b/g, "chahiye"],
    [/\bchahie\b/g, "chahiye"],
    // bahut → bahut (stable)
    // theek variations
    [/\bthik\b/g, "theek"],
    [/\btik\b/g, "theek"],
    // abhi → abhi (stable)
    // kyunki → kyunki (stable)
    // nahi → nahi
    [/\bnahin\b/g, "nahi"],
    [/\bnahiin\b/g, "nahi"],
    // aaj → aaj
    [/\baaj\b/g, "aaj"],
    // ghar → ghar (stable)
    // mujhe → mujhe (stable)
    // tumhara → tumhara
    [/\btumhari\b/g, "tumhari"],
    // woh / voh → woh
    [/\bvoh\b/g, "woh"],
    // matlab → matlab (stable)
    // sunna → sunna (stable)
    // chalo → chalo
    [/\bchlo\b/g, "chalo"],
    [/\bchal\b/g, "chal"],   // keep chal — it's valid imperative
  ],

  // ── Urdu (ur) ─────────────────────────────────────────────
  ur: [
    [/\bnahin\b/g, "nahi"],
    [/\bvoh\b/g, "woh"],
    [/\bkrna\b/g, "karna"],
    [/\bchahie\b/g, "chahiye"],
    [/\bthik\b/g, "theek"],
    [/\btik\b/g, "theek"],
    // aap → aap (stable)
    // janab → janab (stable)
    // shukriya → shukriya (stable)
    [/\bshukria\b/g, "shukriya"],
  ],

  // ── Tamil (ta) ────────────────────────────────────────────
  ta: [
    // enna / ena → enna (what / what happened)
    [/\bena\b/g, "enna"],
    [/\benna\b/g, "enna"],   // already correct, keep stable
    // panra / panren stable
    // eppo → eppo (stable)
    // yaar / yar → yaar (friend / who) — match post-phonetics form too
    [/\byar\b/g, "yaar"],
    [/\byaar\b/g, "yaar"],   // already correct
    // sollu variations
    [/\bsolu\b/g, "sollu"],
    // thambi → thambi (stable)
    // akka → akka (stable)
    // vandha / vantha
    [/\bvanda\b/g, "vantha"],
    // nalla → nalla (stable)
    // paaru → paaru
    [/\bparu\b/g, "paaru"],
    // seri → seri (stable)
    // vazha → vazha (stable)
    // mudinchu → mudinchu (stable)
    // edhu / ethu → edhu
    [/\bethu\b/g, "edhu"],
    // ingae / inga → ingae
    [/\binga\b/g, "ingae"],
  ],

  // ── Kannada (kn) ──────────────────────────────────────────
  kn: [
    // enu / yenu → enu (what)
    [/\byenu\b/g, "enu"],
    // maadtha / maadta → maadtha
    [/\bmaadta\b/g, "maadtha"],
    // illi / illi (stable)
    // heli → heli (stable)
    // banni → banni (stable)
    // swalpa → swalpa (stable)
    // gottilla → gottilla (stable)
    [/\bgotilla\b/g, "gottilla"],
    // yaako → yaako
    [/\byako\b/g, "yaako"],
    // nanna → nanna (stable)
    // nimma → nimma (stable)
    [/\bnimha\b/g, "nimma"],
    // aagilla → aagilla
    [/\bagilla\b/g, "aagilla"],
  ],

  // ── Malayalam (ml) ────────────────────────────────────────
  ml: [
    // entha / entu → entha
    [/\bentu\b/g, "entha"],
    // cheyunna / cheyuna → cheyunna
    [/\bcheyuna\b/g, "cheyunna"],
    // parayoo / parayo → parayoo
    [/\bparayo\b/g, "parayoo"],
    // poda → poda (stable)
    // mone → mone (stable)
    // alle → alle (stable)
    // undo / undo (stable)
    [/\bundo\b/g, "undo"],
    // vaa → vaa (stable)
    // aanu → aanu
    [/\banu\b/g, "aanu"],
    // ningal → ningal (stable)
    [/\bngl\b/g, "ningal"],
  ],

  // ── Bengali (bn) ──────────────────────────────────────────
  bn: [
    // ki / ki (stable — "what")
    // korchi / krchi → korchi
    [/\bkrchi\b/g, "korchi"],
    // hobe → hobe (stable)
    // jabo → jabo (stable)
    // ache → ache (stable)
    // bhalo → bhalo
    [/\bbhlo\b/g, "bhalo"],
    // amake → amake
    [/\bamke\b/g, "amake"],
    // tomake → tomake
    [/\btomke\b/g, "tomake"],
    // dekhchi → dekhchi
    [/\bdkhchi\b/g, "dekhchi"],
    // bosho → bosho
    [/\bbsho\b/g, "bosho"],
  ],

  // ── Marathi (mr) ──────────────────────────────────────────
  mr: [
    // kay / kaay → kay
    [/\bkaay\b/g, "kay"],
    // karto / kartoy → karto
    [/\bkrtoy\b/g, "karto"],
    // aahe → aahe (stable)
    // nahi → nahi (stable)
    // yeto → yeto
    [/\byto\b/g, "yeto"],
    // bagh → bagh (stable)
    // sangto → sangto
    [/\bsnagto\b/g, "sangto"],
    // mala → mala (stable)
    // tula → tula (stable)
    // aai → aai (stable)
    [/\baayee\b/g, "aai"],
  ],

  // ── Gujarati (gu) ─────────────────────────────────────────
  gu: [
    // su / shu → su (what)
    [/\bshu\b/g, "su"],
    // karo → karo (stable)
    // chhe → chhe (stable)
    // kem → kem (stable)
    // tamne → tamne (stable)
    [/\btamne\b/g, "tamne"],
    // mane → mane (stable)
    // nathi → nathi
    [/\bnati\b/g, "nathi"],
    // aavo → aavo
    [/\bavo\b/g, "aavo"],
  ],

  // ── Punjabi (pa) ──────────────────────────────────────────
  pa: [
    // ki / ki (stable)
    // karda / krda → karda
    [/\bkrda\b/g, "karda"],
    // kardi / krdi → kardi
    [/\bkrdi\b/g, "kardi"],
    // haan → haan (stable)
    // nahi → nahi (stable)
    [/\bnaiyo\b/g, "nahin"],
    // tenu → tenu (stable)
    // meri → meri (stable)
    // teri → teri (stable)
    // ja → ja (stable)
    // aa → aa (stable)
    [/\baaja\b/g, "aaja"],
  ],

  // ── Odia (or) ─────────────────────────────────────────────
  or: [
    // kana / ku → kana
    [/\bku\b/g, "kana"],
    // achi → achi (stable)
    // hela → hela (stable)
    // jiba → jiba (stable)
    [/\bjba\b/g, "jiba"],
    // mora → mora (stable)
    [/\bmra\b/g, "mora"],
  ],

  // ── Assamese (as) ─────────────────────────────────────────
  as: [
    // ki / ki (stable)
    // koribo → koribo
    [/\bkrbo\b/g, "koribo"],
    // ache / ase → ache
    [/\base\b/g, "ache"],
    // nai → nai (stable)
    // aami → aami
    [/\bami\b/g, "aami"],
  ],

  // ── Bhojpuri (bho) ────────────────────────────────────────
  bho: [
    [/\bkrla\b/g, "karla"],
    [/\bkrba\b/g, "karba"],
    [/\bhau\b/g, "hau"],   // stable (yes)
    [/\bnahin\b/g, "nahi"],
  ],

  // ── Awadhi (awa) ──────────────────────────────────────────
  awa: [
    [/\bkrla\b/g, "karla"],
    [/\bnahin\b/g, "nahi"],
    [/\bhain\b/g, "hai"],
  ],

  // ── Haryanvi (har) ────────────────────────────────────────
  har: [
    [/\bkrse\b/g, "karse"],
    [/\bnahin\b/g, "nahi"],
    [/\bthara\b/g, "thara"],   // stable
  ],

  // ── Nepali (ne) ───────────────────────────────────────────
  ne: [
    [/\bkehi\b/g, "kehi"],   // stable
    [/\bchha\b/g, "chha"],   // stable
    [/\bchaina\b/g, "chaina"],
    [/\bkasto\b/g, "kasto"],
    [/\bhaina\b/g, "haina"],
  ],

  // ── Maithili (mai) ────────────────────────────────────────
  mai: [
    [/\bchhi\b/g, "chhi"],   // stable
    [/\bnahii\b/g, "nahi"],
    [/\bhamara\b/g, "hamara"],
  ],

  // ── Kashmiri (ks) ─────────────────────────────────────────
  ks: [
    [/\bchhu\b/g, "chhu"],   // stable
    [/\bchhi\b/g, "chhi"],
    [/\bnaav\b/g, "naav"],
  ],

  // ── Tulu (tcy) ────────────────────────────────────────────
  tcy: [
    [/\bencha\b/g, "encha"],   // stable
    [/\bullar\b/g, "ullar"],
    [/\bpothe\b/g, "pothe"],
  ],

  // ── Konkani (kok) ─────────────────────────────────────────
  kok: [
    [/\bkitem\b/g, "kitem"],   // stable
    [/\basa\b/g, "asa"],
    [/\bnaka\b/g, "naka"],
  ],

  // ── Mizo (lus) ────────────────────────────────────────────
  lus: [
    [/\bchiang\b/g, "chiang"],
    [/\bni\b/g, "ni"],
  ],

  // ── Khasi (kha) ───────────────────────────────────────────
  kha: [
    [/\bda\b/g, "da"],
    [/\blah\b/g, "lah"],
  ],

  // ── Santali (sat) ─────────────────────────────────────────
  sat: [
    [/\bdo\b/g, "do"],   // stable
    [/\bjotha\b/g, "jotha"],
  ],

  // ── Sanskrit (sa) ─────────────────────────────────────────
  sa: [
    [/\bnaasti\b/g, "nasti"],
    [/\basti\b/g, "asti"],
    [/\bkim\b/g, "kim"],
  ],

  // ── Bodo (brx) ────────────────────────────────────────────
  brx: [
    [/\bwi\b/g, "wi"],
    [/\bnang\b/g, "nang"],
  ],

  // ── Manipuri / Meitei (mni) ───────────────────────────────
  mni: [
    [/\bni\b/g, "ni"],
    [/\bamasung\b/g, "amasung"],
  ],
};

/**
 * normalizeByLanguage(text, sourceLang)
 * Applies language-specific light corrections.
 * Falls through gracefully for unknown/unsupported lang codes.
 */
function normalizeByLanguage(text, sourceLang) {
  const lang = (sourceLang || "").toLowerCase().trim();
  const rules = LANG_RULES[lang];
  if (!rules) return text;

  let result = text;
  for (const [pattern, replacement] of rules) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
//  SECTION 5 — SAFE MODE GUARD
// ─────────────────────────────────────────────────────────────

/**
 * safeMode(original, normalized, sourceLang)
 * Fast safety guard using token-level change ratio.
 * O(n) token comparison — no DP, suitable for every-keystroke use.
 *
 * Strategy:
 *   - Split both into word tokens
 *   - Count tokens whose content changed
 *   - If sourceLang is explicitly set, trust the pipeline more (threshold 0.85)
 *   - Without lang, be conservative (threshold 0.50)
 *   - If normalized has MORE tokens (expansion occurred), always allow it
 */
function safeMode(original, normalized, sourceLang) {
  if (!original || original === normalized) return normalized;

  const origTokens = original.split(" ");
  const normTokens = normalized.split(" ");

  // Expansion (shortcuts added words) — always safe
  if (normTokens.length > origTokens.length) return normalized;

  // Count changed tokens (compare by position)
  const len = Math.min(origTokens.length, normTokens.length);
  let changed = 0;
  for (let i = 0; i < len; i++) {
    if (origTokens[i] !== normTokens[i]) changed++;
  }

  const changeRatio = changed / Math.max(origTokens.length, 1);
  // When lang is explicitly provided, trust the pipeline more
  const threshold = sourceLang ? 0.85 : 0.50;
  return changeRatio <= threshold ? normalized : original;
}

// ─────────────────────────────────────────────────────────────
//  SECTION 6 — MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────

/**
 * normalizeInput(text, sourceLang)
 *
 * @param {string} text        - Raw user input
 * @param {string} sourceLang  - BCP-47 / ISO 639-1/3 language code
 *                               e.g. "te", "hi", "ta", "kn", "ml",
 *                               "bn", "mr", "gu", "pa", "or", "as",
 *                               "ur", "ne", "mai", "ks", "tcy", "kok",
 *                               "lus", "kha", "sat", "sa", "brx", "mni",
 *                               "bho", "awa", "har", "en"
 * @returns {string}           - Normalized text, safe for translation
 */
function normalizeInput(text, sourceLang) {
  if (!text || typeof text !== "string") return "";

  const original = text.trim();
  if (!original) return "";

  // Step 1 — Basic cleaning
  let result = cleanText(original);

  // Step 2 — Universal phonetic normalization
  result = normalizePhonetics(result);

  // Step 3 — Chat shortcut expansion
  result = normalizeShortcuts(result, sourceLang);

  // Step 4 — Language-specific light normalization
  result = normalizeByLanguage(result, sourceLang);

  // Step 5 — Safe mode guard
  result = safeMode(cleanText(original), result, sourceLang);

  return result;
}

// ─────────────────────────────────────────────────────────────
//  SECTION 7 — EXPORTS (CommonJS + ESM compatible)
// ─────────────────────────────────────────────────────────────

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizeInput,
    cleanText,
    normalizePhonetics,
    normalizeShortcuts,
    normalizeByLanguage,
    safeMode,
  };
}
// For ESM environments:
// export { normalizeInput, cleanText, normalizePhonetics, normalizeShortcuts, normalizeByLanguage, safeMode };
