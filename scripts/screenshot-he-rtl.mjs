/**
 * Mobile (390px) Hebrew UI screenshots for RTL math verification.
 * Usage: npm run start (port 3000) then node scripts/screenshot-he-rtl.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.join(process.cwd(), "screenshots-he-rtl");

const bootState = {
  langChosen: true,
  lang: "he",
  coins: 500,
  real: { balance: 8800, weeklyCap: 10000 },
};

async function seedHe(page) {
  await page.addInitScript((state) => {
    localStorage.setItem("finni-state-v1", JSON.stringify(state));
  }, bootState);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "he-IL",
  });

  const page = await context.newPage();
  await seedHe(page);

  await page.goto(`${BASE}/mission?m=month`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot(page, "mission-month");

  await page.goto(`${BASE}/blitz`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "blitz");

  await page.goto(`${BASE}/dream`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "dream-shop");

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "home-balance");

  await browser.close();
  console.log("Saved to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
