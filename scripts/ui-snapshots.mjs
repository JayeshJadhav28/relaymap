import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
const outDir = path.join(
  process.cwd(),
  "documentation",
  "design",
  "screens",
  process.env.SNAPSHOT_DIR ?? "original",
);
mkdirSync(outDir, { recursive: true });

const desktop = { width: 1440, height: 1000 };
const mobile = { width: 390, height: 844 };

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({ viewport: desktop, deviceScaleFactor: 1 });
const page = await context.newPage();

await page.request.post(`${baseURL}/api/reset`);
await page.request.post(`${baseURL}/api/role`, { data: { role: "lead" } });

const pages = [
  ["landing", "/"],
  ["dashboard", "/dashboard"],
  ["sources", "/sources"],
  ["knowledge", "/knowledge"],
  ["review", "/review"],
  ["timeline", "/timeline"],
  ["handovers", "/handovers"],
  ["settings", "/settings"],
  ["login", "/login"],
  ["register", "/register"],
  ["real-app", "/app"],
];

for (const [name, route] of pages) {
  await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await page.screenshot({
  path: path.join(outDir, `${name}-desktop.png`),
  fullPage: process.env.SNAPSHOT_FULL !== "false",
});
}

const mobilePage = await context.newPage();
await mobilePage.setViewportSize(mobile);
for (const [name, route] of [
  ["landing", "/"],
  ["dashboard", "/dashboard"],
  ["knowledge", "/knowledge"],
  ["login", "/login"],
  ["real-app", "/app"],
]) {
  await mobilePage.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForTimeout(600);
  await mobilePage.screenshot({ path: path.join(outDir, `${name}-mobile.png`), fullPage: true });
}

await browser.close();
console.log(
  `Captured ${pages.length} desktop and 5 mobile screenshots in ${outDir}`,
);
