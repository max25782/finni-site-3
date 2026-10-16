import bidiFactory from "bidi-js";
import { isolateMath, ltr, MATH_DIR } from "../../lib/bidi.ts";

const bidi = bidiFactory();

function fail(msg) {
  console.log("НЕ УПАЛО:", msg);
  process.exitCode = 1;
}

if (MATH_DIR !== "ltr") fail("MATH_DIR");

const hint = isolateMath("(רמז: 8 ÷ 80 × 100.)", "he");
if (!hint.includes("\u20668 ÷ 80 × 100\u2069") || !hint.endsWith(".)")) fail("hint isolate: " + hint);

const price = isolateMath("המחיר עלה מ-80 ₪ ל-88 ₪. זה +8 ₪.", "he");
if (!price.includes("\u2066מ-80 ₪\u2069") || !price.includes("\u2066+8 ₪\u2069")) fail("price sentence: " + price);

const ruSame = isolateMath("8 ÷ 80", "ru");
if (ruSame !== "8 ÷ 80") fail("ru unchanged");

const neg = isolateMath("הפסד −12 ₪.", "he");
if (!neg.includes(ltr("−12 ₪")) || !neg.endsWith(".")) fail("negative: " + neg);

const dec = isolateMath("שיעור 3.14% מהסכום.", "he");
if (!dec.includes(ltr("3.14%"))) fail("decimal percent: " + dec);

function digitOrderInVisual(logical) {
  const embeddingLevels = bidi.getEmbeddingLevels(logical, "rtl");
  const visual = bidi.getReorderedString(logical, embeddingLevels);
  const nums = visual.match(/\d+/g) ?? [];
  return nums.map(Number);
}

const visualHint = digitOrderInVisual(hint);
if (visualHint.join(",") !== "8,80,100") fail("visual order hint: " + visualHint.join(","));

const visualPrice = digitOrderInVisual(price);
if (!visualPrice.includes(80) || !visualPrice.includes(88) || !visualPrice.includes(8)) fail("visual price nums: " + visualPrice);

console.log(process.exitCode ? "FAIL bidi" : "bidi tests ok");
