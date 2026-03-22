/**
 * ============================================================
 *  VAANI — Normalizer Test Suite
 *  normalizer.test.js
 * ============================================================
 */

const {
  normalizeInput,
  cleanText,
  normalizePhonetics,
  normalizeShortcuts,
  normalizeByLanguage,
} = require("./normalizer");

// ─── Tiny test runner ────────────────────────────────────────
let passed = 0, failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✅  ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ❌  ${label}`);
    console.error(`      ${e.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected "${expected}", got "${actual}"`);
      }
    },
    toContain(expected) {
      if (!actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
    not: {
      toBe(expected) {
        if (actual === expected) {
          throw new Error(`Expected NOT "${expected}", but got it`);
        }
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────
//  STEP 1 — cleanText tests
// ─────────────────────────────────────────────────────────────
console.log("\n── Step 1: cleanText ──");

test("lowercase conversion", () => {
  expect(cleanText("EM JARIGINDI")).toBe("em jarigindi");
});

test("trim leading/trailing spaces", () => {
  expect(cleanText("  hello  ")).toBe("hello");
});

test("collapse internal spaces", () => {
  expect(cleanText("em   jarigindi")).toBe("em jarigindi");
});

test("strip repeated exclamation", () => {
  expect(cleanText("wow!!!")).toBe("wow!");
});

test("strip repeated question marks", () => {
  expect(cleanText("kya hua???")).toBe("kya hua?");
});

test("preserve single ? and !", () => {
  expect(cleanText("em jarigindi?")).toBe("em jarigindi?");
});

test("remove commas and dots", () => {
  expect(cleanText("hello, world.")).toBe("hello world");
});

test("full messy input", () => {
  expect(cleanText("  EM   jarigindi!!!  ")).toBe("em jarigindi!");
});

// ─────────────────────────────────────────────────────────────
//  STEP 2 — normalizePhonetics tests
// ─────────────────────────────────────────────────────────────
console.log("\n── Step 2: normalizePhonetics ──");

test("aa → a (unprotected word)", () => {
  // "paas" (near) is not protected — aa→a applies
  expect(normalizePhonetics("paas")).toBe("pas");
});

test("aa protected in meaningful words (baat stays baat)", () => {
  // baat = 'talk/matter' in Hindi — must NOT be collapsed to 'bat'
  expect(normalizePhonetics("baat")).toBe("baat");
});

test("ee → i", () => {
  expect(normalizePhonetics("theek")).toBe("thik");
});

test("oo → u", () => {
  expect(normalizePhonetics("doost")).toBe("dust");
});

test("ae → e", () => {
  expect(normalizePhonetics("jaega")).toBe("jega");
});

test("compress 3+ repeated chars", () => {
  expect(normalizePhonetics("goooood")).toBe("god");
});

test("compress repeated vowels in word", () => {
  expect(normalizePhonetics("jarigindiii")).toBe("jarigindi");
});

test("ph → f (word-initial)", () => {
  expect(normalizePhonetics("phone")).toBe("fone");
});

test("bh → b", () => {
  expect(normalizePhonetics("bhaag")).toBe("bag");
});

test("dh → d", () => {
  expect(normalizePhonetics("dhyan")).toBe("dyan");
});

// ─────────────────────────────────────────────────────────────
//  STEP 3 — normalizeShortcuts tests
// ─────────────────────────────────────────────────────────────
console.log("\n── Step 3: normalizeShortcuts ──");

test("kr → kar (Hindi)", () => {
  const result = normalizeShortcuts("kya kr rha h", "hi");
  expect(result).toContain("kar");
});

test("rha → raha (Hindi)", () => {
  const result = normalizeShortcuts("rha hai", "hi");
  expect(result).toContain("raha");
});

test("h → hai (Hindi)", () => {
  const result = normalizeShortcuts("kya kar raha h", "hi");
  expect(result).toContain("hai");
});

test("nhi → nahi (Hindi)", () => {
  const result = normalizeShortcuts("nhi chahiye", "hi");
  expect(result).toContain("nahi");
});

test("chlo → chalo (Hindi)", () => {
  // This is in lang rules not shortcuts, tested via full pipeline
  const result = normalizeInput("chlo yaar", "hi");
  expect(result).toContain("chalo");
});

test("shortcuts NOT applied to wrong language", () => {
  // kr is Telugu too, but the rule targets hi/ur
  const result = normalizeShortcuts("krishna", "te");
  // krishna should NOT become karrishna
  expect(result).toBe("krishna");
});

test("u → you for English context", () => {
  const result = normalizeShortcuts("can u help me", "en");
  expect(result).toContain("you");
});

test("u NOT expanded for Telugu", () => {
  const result = normalizeShortcuts("nuvvu ela unnav", "te");
  // 'u' inside words should not expand
  expect(result).toContain("nuvvu");
});

// ─────────────────────────────────────────────────────────────
//  STEP 4 — normalizeByLanguage tests
// ─────────────────────────────────────────────────────────────
console.log("\n── Step 4: normalizeByLanguage ──");

test("emi → em (Telugu)", () => {
  expect(normalizeByLanguage("emi jarigindi", "te")).toContain("em");
});

test("jargindi → jarigindi (Telugu)", () => {
  expect(normalizeByLanguage("em jargindi", "te")).toContain("jarigindi");
});

test("jarigndi → jarigindi (Telugu)", () => {
  expect(normalizeByLanguage("em jarigndi", "te")).toContain("jarigindi");
});

test("ena → enna (Tamil)", () => {
  expect(normalizeByLanguage("ena panra", "ta")).toContain("enna");
});

test("yar → yaar (Tamil)", () => {
  expect(normalizeByLanguage("yar da", "ta")).toContain("yaar");
});

test("voh → woh (Hindi)", () => {
  expect(normalizeByLanguage("voh kaun hai", "hi")).toContain("woh");
});

test("thik → theek (Hindi)", () => {
  expect(normalizeByLanguage("thik hai", "hi")).toContain("theek");
});

test("unknown lang code falls through safely", () => {
  expect(normalizeByLanguage("test input", "xx")).toBe("test input");
});

// ─────────────────────────────────────────────────────────────
//  STEP 5 — Full pipeline integration tests (the spec cases)
// ─────────────────────────────────────────────────────────────
console.log("\n── Step 5: Full Pipeline normalizeInput ──");

test('[SPEC] "em jargindi" → "em jarigindi" (Telugu)', () => {
  expect(normalizeInput("em jargindi", "te")).toBe("em jarigindi");
});

test('[SPEC] "emi jarigindi" → "em jarigindi" (Telugu)', () => {
  expect(normalizeInput("emi jarigindi", "te")).toBe("em jarigindi");
});

test('[SPEC] "em jarigndi" → "em jarigindi" (Telugu)', () => {
  expect(normalizeInput("em jarigndi", "te")).toBe("em jarigindi");
});

test('[SPEC] "kya kr rha h" → contains kar raha hai (Hindi)', () => {
  const result = normalizeInput("kya kr rha h", "hi");
  expect(result).toContain("kar");
  expect(result).toContain("raha");
  expect(result).toContain("hai");
});

test('[SPEC] "ena panra da" → "enna panra da" (Tamil)', () => {
  expect(normalizeInput("ena panra da", "ta")).toBe("enna panra da");
});

// ─────────────────────────────────────────────────────────────
//  STEP 6 — Safe mode & regression tests
// ─────────────────────────────────────────────────────────────
console.log("\n── Step 6: Safe Mode & Regressions ──");

test("correct inputs not distorted — Telugu stable", () => {
  const result = normalizeInput("em jarigindi", "te");
  expect(result).toBe("em jarigindi");
});

test("correct inputs not distorted — Hindi stable", () => {
  const result = normalizeInput("kya kar raha hai", "hi");
  // Should stay the same (already correct)
  expect(result).toContain("kya");
  expect(result).toContain("kar");
  expect(result).toContain("raha");
  expect(result).toContain("hai");
});

test("correct inputs not distorted — Tamil stable", () => {
  const result = normalizeInput("enna panra da", "ta");
  expect(result).toBe("enna panra da");
});

test("empty string returns empty", () => {
  expect(normalizeInput("", "hi")).toBe("");
});

test("null/undefined returns empty", () => {
  expect(normalizeInput(null, "hi")).toBe("");
  expect(normalizeInput(undefined, "te")).toBe("");
});

test("numbers and question mark preserved", () => {
  const result = normalizeInput("enu 3 jana iddare?", "kn");
  expect(result).toContain("?");
});

test("Malayalam entha stable", () => {
  const result = normalizeInput("entha cheyunna", "ml");
  expect(result).toContain("entha");
});

test("Bengali korchi expansion", () => {
  const result = normalizeInput("ami krchi", "bn");
  expect(result).toContain("korchi");
});

test("Punjabi karda expansion", () => {
  const result = normalizeInput("tu krda hai", "pa");
  expect(result).toContain("karda");
});

test("No crash on very long input", () => {
  const long = "kya ".repeat(100) + "ho raha h";
  const result = normalizeInput(long, "hi");
  expect(typeof result).toBe("string");
});

test("Very short single char input", () => {
  const result = normalizeInput("k", "hi");
  expect(typeof result).toBe("string");
});

// ─────────────────────────────────────────────────────────────
//  PERFORMANCE BENCHMARK
// ─────────────────────────────────────────────────────────────
console.log("\n── Performance ──");
const ITERATIONS = 10_000;
const sample = "kya kr rha h yaar nhi pata";
const start = Date.now();
for (let i = 0; i < ITERATIONS; i++) normalizeInput(sample, "hi");
const ms = Date.now() - start;
const perCall = (ms / ITERATIONS * 1000).toFixed(2);
console.log(`  ⚡ ${ITERATIONS.toLocaleString()} calls in ${ms}ms — ${perCall}µs per call`);
if (ms < 500) {
  console.log("  ✅  Performance: PASS (<500ms for 10k calls)");
  passed++;
} else {
  console.log("  ❌  Performance: FAIL (too slow)");
  failed++;
}

// ─────────────────────────────────────────────────────────────
//  SUMMARY
// ─────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`  Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
console.log(`${"─".repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
