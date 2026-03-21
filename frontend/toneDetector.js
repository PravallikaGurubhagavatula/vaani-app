/* ================================================================
   Vaani — toneDetector.js  (global build — no import/export)
   Depends on: slangDictionary.js (must load first)
   All symbols attached to window. Load with plain <script> tag.
================================================================ */

window.VAANI_TONES = {
  FRIENDLY:   "friendly",
  ANGRY:      "angry",
  CASUAL:     "casual",
  RESPECTFUL: "respectful",
  NEUTRAL:    "neutral",
};

// ── Punctuation / casing signal rules ─────────────────────────────
var _PUNCT_RULES = [
  { pattern: /!{2,}/,                    tone: "angry",      weight: 3 },
  { pattern: /\b[A-Z]{3,}\b/,           tone: "angry",      weight: 2 },
  { pattern: /!(?!!)/,                   tone: "angry",      weight: 1 },
  { pattern: /\?/,                       tone: "casual",     weight: 1 },
  { pattern: /\.{2,}|…/,                tone: "casual",     weight: 1 },
  { pattern: /[\u{1F600}-\u{1F64F}]/u,  tone: "friendly",   weight: 2 },
  { pattern: /[\u{1F300}-\u{1F5FF}]/u,  tone: "friendly",   weight: 1 },
  { pattern: /[❤️💕💙🌟⭐✨]/u,          tone: "friendly",   weight: 2 },
];

// ── Language-specific keyword banks ──────────────────────────────
var _LANG_KEYWORDS = {
  te: [
    { words: ["ra","ri","bey","babu","nayana","chelli","anna","akkaa"],       tone: "friendly",   weight: 2 },
    { words: ["enti","em","emiti","ela","cheppu","chuso"],                    tone: "casual",     weight: 1 },
    { words: ["meeru","miru","daya","chesukoni","please","vinnara","vinandi"],tone: "respectful", weight: 2 },
    { words: ["pashupati","veltava","poru","nee","ra ikka","inkenti"],        tone: "angry",      weight: 2 },
    { words: ["రా","రి","బేయ్","ఏంటి","మీరు","దయచేసి"],                      tone: "casual",     weight: 1 },
  ],
  hi: [
    { words: ["yaar","bhai","arre","dost","buddy","oye","bhaiya"],            tone: "friendly",   weight: 2 },
    { words: ["kya","kyun","kaise","kab","kahan","matlab"],                   tone: "casual",     weight: 1 },
    { words: ["please","kripa","kripaya","aap","aapko","namaste","shukriya","dhanyavaad","ji"], tone: "respectful", weight: 2 },
    { words: ["chup","shut","nikal","jaa","bol","bata","abhi","turant","chalo"], tone: "angry",   weight: 2 },
    { words: ["यार","भाई","आप","कृपया","चुप","निकल"],                         tone: "casual",     weight: 1 },
  ],
  ta: [
    { words: ["da","di","dei","machan","kanna","pa","ma"],                    tone: "friendly",   weight: 2 },
    { words: ["enna","epdi","yenna","sollu","paru","paaru"],                  tone: "casual",     weight: 1 },
    { words: ["please","ungal","ungalukku","nandri","vanakkam","aiya","ayya"],tone: "respectful", weight: 2 },
    { words: ["poda","thollai","vaa","po","vidu"],                            tone: "angry",      weight: 2 },
    { words: ["டா","டி","மச்சான்","நன்றி","வணக்கம்","போடா"],                  tone: "casual",     weight: 1 },
  ],
  kn: [
    { words: ["guru","machaa","bhai","anna","akka","aye"],                    tone: "friendly",   weight: 2 },
    { words: ["yen","yenu","hege","hengide","heli","nodu"],                   tone: "casual",     weight: 1 },
    { words: ["please","dayavittu","nimma","nimage","dhanyavada","saar"],     tone: "respectful", weight: 2 },
    { words: ["hogri","summane","bidi","hogu","bekilla","sullu"],             tone: "angry",      weight: 2 },
    { words: ["ಗುರು","ದಯವಿಟ್ಟು","ನಿಮ್ಮ","ಹೇಳಿ"],                              tone: "casual",     weight: 1 },
  ],
  ml: [
    { words: ["mone","mol","chetta","chechi","machaan","da","di"],            tone: "friendly",   weight: 2 },
    { words: ["enthu","engane","evidey","parayo","nokkku"],                   tone: "casual",     weight: 1 },
    { words: ["please","dayavayi","ningal","ningalude","nandi","namaskaram","saar"], tone: "respectful", weight: 2 },
    { words: ["poda","thollayedam","thalleda","poyi","vidu"],                 tone: "angry",      weight: 2 },
    { words: ["മോനേ","ദയവായി","നന്ദി","നമസ്കാരം","പോടാ"],                     tone: "casual",     weight: 1 },
  ],
  bn: [
    { words: ["bhai","dada","didi","yaar","bondhu","re"],                     tone: "friendly",   weight: 2 },
    { words: ["ki","kemon","kothay","kobe","keno","bolo","dekho"],            tone: "casual",     weight: 1 },
    { words: ["please","dayakore","apni","apnar","dhanyobad","namaskar"],     tone: "respectful", weight: 2 },
    { words: ["chupo","ber ho","jao","chol","abhi"],                          tone: "angry",      weight: 2 },
    { words: ["ভাই","দাদা","দয়া করে","ধন্যবাদ","যাও"],                        tone: "casual",     weight: 1 },
  ],
  mr: [
    { words: ["bhau","dada","yaar","bhai","re","ga","tu"],                   tone: "friendly",   weight: 2 },
    { words: ["kay","kasa","kuthe","kadhi","ka","sang","bagh"],               tone: "casual",     weight: 1 },
    { words: ["please","krupaya","tumhi","tumhala","dhanyavad","namaskar"],   tone: "respectful", weight: 2 },
    { words: ["jaao","chup","gappa","jaav","nik"],                            tone: "angry",      weight: 2 },
    { words: ["भाऊ","कृपया","तुम्ही","धन्यवाद","जा"],                          tone: "casual",     weight: 1 },
  ],
  gu: [
    { words: ["bhai","yaar","dost","mitro","kem cho","kem"],                  tone: "friendly",   weight: 2 },
    { words: ["su","kem","kya","kyare","kyan","kaho","juo"],                  tone: "casual",     weight: 1 },
    { words: ["please","maherbani","aap","aapne","aabhar"],                   tone: "respectful", weight: 2 },
    { words: ["jao","chup","nik","bolo","abad"],                              tone: "angry",      weight: 2 },
    { words: ["ભાઈ","મહેરબાની","આભાર","જાઓ"],                                  tone: "casual",     weight: 1 },
  ],
  pa: [
    { words: ["yaar","paaji","oye","bhai","veer","penji","dost"],             tone: "friendly",   weight: 2 },
    { words: ["ki","kive","kiddan","dasso","dassi","vekho","sun"],            tone: "casual",     weight: 1 },
    { words: ["please","meharbaani","tussi","tuhade","shukriya","satsriakal"],tone: "respectful", weight: 2 },
    { words: ["jao","chup","nikal","bol","chad","hatoo"],                     tone: "angry",      weight: 2 },
    { words: ["ਯਾਰ","ਪਾਜੀ","ਮਿਹਰਬਾਨੀ","ਜਾਓ"],                                 tone: "casual",     weight: 1 },
  ],
  ur: [
    { words: ["yaar","bhai","dost","jaan","oye"],                             tone: "friendly",   weight: 2 },
    { words: ["kya","kaise","kyun","kab","kahan","bolo","batao"],             tone: "casual",     weight: 1 },
    { words: ["please","meharbani","aap","aapko","shukriya","adaab","janab"], tone: "respectful", weight: 2 },
    { words: ["chup","nikal","jao","bol","abhi"],                             tone: "angry",      weight: 2 },
  ],
  or: [
    { words: ["bhai","didi","yaar","re","hela"],                              tone: "friendly",   weight: 2 },
    { words: ["ki","kemiti","kebe","kahim","bolo"],                           tone: "casual",     weight: 1 },
    { words: ["please","daya kari","aapana","dhanyabad","namaskar"],          tone: "respectful", weight: 2 },
    { words: ["jaa","chupa","ber ho"],                                        tone: "angry",      weight: 2 },
  ],
  as: [
    { words: ["bhai","dada","didi","yaar"],                                   tone: "friendly",   weight: 2 },
    { words: ["ki","kene","kat","kot","kobo"],                                tone: "casual",     weight: 1 },
    { words: ["please","onugroho","apunar","dhanyabad","namaskar"],           tone: "respectful", weight: 2 },
    { words: ["jaa","chupa"],                                                  tone: "angry",      weight: 2 },
  ],
  ne: [
    { words: ["dai","bhai","yaar","didi","sathi"],                            tone: "friendly",   weight: 2 },
    { words: ["ke","kasari","kahile","kahan","bata"],                         tone: "casual",     weight: 1 },
    { words: ["please","kripaya","tapai","tapailai","dhanyabad","namaskar"],  tone: "respectful", weight: 2 },
    { words: ["jaa","chup","nikal","bol"],                                    tone: "angry",      weight: 2 },
  ],
  bho: [
    { words: ["bhai","yaar","dost","bhaiya","re"],                            tone: "friendly",   weight: 2 },
    { words: ["ka ba","ki","kaise","kab","kahan","bolo"],                     tone: "casual",     weight: 1 },
    { words: ["please","bhaiya","sahib","dhanyawad","namaskar"],              tone: "respectful", weight: 2 },
    { words: ["chup","jaa","nik","bol"],                                      tone: "angry",      weight: 2 },
  ],
  bgc: [
    { words: ["bhai","yaar","arre","oye"],                                    tone: "friendly",   weight: 2 },
    { words: ["ke","kaise","kab","kahan","bol"],                              tone: "casual",     weight: 1 },
    { words: ["please","aap","shukriya","namaskar"],                          tone: "respectful", weight: 2 },
    { words: ["chup","jaa","nik","ab"],                                       tone: "angry",      weight: 2 },
  ],
  _common: [
    { words: ["please","kindly","request","sorry","excuse","thank","thanks","regards"], tone: "respectful", weight: 2 },
    { words: ["hi","hello","hey","sup","yo"],                                 tone: "friendly",   weight: 1 },
    { words: ["come here","stop","now","immediately","right now","shut up","get out","go away"], tone: "angry", weight: 3 },
    { words: ["lol","haha","lmao","rofl","hehe"],                             tone: "casual",     weight: 2 },
    { words: ["okay","ok","fine","sure","alright","noted"],                   tone: "neutral",    weight: 1 },
  ],
};

function _tokeniseTone(text) {
  return String(text)
    .toLowerCase()
    .split(/[\s\u200b\u200c\u200d\ufeff,;:\u0964\u0965।॥]+/)
    .map(function(t) { return t.replace(/^[!?.…\-–—"'()\[\]]+|[!?.…\-–—"'()\[\]]+$/g, ""); })
    .filter(function(t) { return t.length > 0; });
}

function _addScore(scores, tone, weight) {
  scores[tone] = (scores[tone] || 0) + weight;
}

function _winningTone(scores) {
  var best = "neutral";
  var bestScore = 0;
  Object.keys(scores).forEach(function(tone) {
    if (scores[tone] > bestScore) {
      bestScore = scores[tone];
      best = tone;
    }
  });
  return best;
}

window.detectTone = function(text, lang) {
  if (!text || typeof text !== "string") return "neutral";
  var trimmed = text.trim();
  if (!trimmed) return "neutral";

  var scores = {};

  // 1. Punctuation / casing
  _PUNCT_RULES.forEach(function(rule) {
    try { if (rule.pattern.test(trimmed)) _addScore(scores, rule.tone, rule.weight); } catch(e) {}
  });

  // 2. Tokenise
  var tokens = _tokeniseTone(trimmed);
  var tokenSet = {};
  tokens.forEach(function(t) { tokenSet[t] = true; });

  // 3. Language-specific keywords
  var langRules = _LANG_KEYWORDS[lang] || [];
  langRules.forEach(function(rule) {
    for (var i = 0; i < rule.words.length; i++) {
      if (tokenSet[rule.words[i].toLowerCase()]) {
        _addScore(scores, rule.tone, rule.weight);
        break;
      }
    }
  });

  // 4. Common cross-language keywords
  _LANG_KEYWORDS._common.forEach(function(rule) {
    for (var i = 0; i < rule.words.length; i++) {
      var p = rule.words[i].toLowerCase();
      if (p.indexOf(" ") !== -1) {
        if (trimmed.toLowerCase().indexOf(p) !== -1) { _addScore(scores, rule.tone, rule.weight); break; }
      } else if (tokenSet[p]) {
        _addScore(scores, rule.tone, rule.weight); break;
      }
    }
  });

  // 5. Slang dictionary tone signals
  if (typeof window.getSlangForLang === "function") {
    var slangDict = window.getSlangForLang(lang);
    var toneMap = {
      friendly: "friendly", casual: "casual", informal: "casual",
      affectionate: "friendly", exclamatory: "friendly", humorous: "casual",
      derogatory: "angry", formal: "respectful", neutral: "neutral",
    };
    tokens.forEach(function(token) {
      var entry = slangDict[token];
      if (entry && entry.tone && toneMap[entry.tone]) {
        _addScore(scores, toneMap[entry.tone], 1);
      }
    });
  }

  // 6. Structural heuristics
  if (tokens.length <= 4 && !scores["respectful"]) _addScore(scores, "casual", 0.5);
  if (tokens.length > 12) _addScore(scores, "neutral", 1);

  return _winningTone(scores);
};

window.detectToneDetailed = function(text, lang) {
  if (!text || typeof text !== "string") return { tone: "neutral", scores: {}, tokens: [] };
  var tone   = window.detectTone(text, lang);
  var tokens = _tokeniseTone(text.trim());
  var slangHits = [];
  if (typeof window.getSlangForLang === "function") {
    var dict = window.getSlangForLang(lang);
    tokens.forEach(function(token) {
      if (dict[token]) slangHits.push({ slang: token, meaning: dict[token].meaning, tone: dict[token].tone });
    });
  }
  return { tone: tone, tokens: tokens, slangHits: slangHits };
};
