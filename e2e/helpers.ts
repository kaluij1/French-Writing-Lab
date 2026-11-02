import { expect, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "../playwright.config";

export const MIXED =
  "Hier, j'ai allé à le marché avec ma grandmother. Il était very crowded et il y avait beaucoup des gens. " +
  "Je pense que il est important de faire des choses ensemble parce que la vie est très courte. J'ai acheté des fleurs. " +
  "Elles étaient très belles. Si j'aurais plus de temps, je voudrais apprendre à cuisiner, mais je suis toujours busy.";

export async function signIn(page: Page) {
  const res = await page.request.post("/api/access", { data: { password: E2E_PASSWORD } });
  expect(res.status()).toBe(200);
}

/** Counts POSTs to /api/analyze made by the page. */
export function countAnalyzeCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/analyze") && r.method() === "POST") calls.push(JSON.parse(r.postData() ?? "{}").lens);
  });
  return calls;
}

export async function writeAndSubmit(page: Page, text = MIXED) {
  await page.goto("/");
  await page.locator("#editor").fill(text);
  await expect(page.getByText(/Saved \d/)).toBeVisible();
  await page.getByRole("button", { name: "Analyze my writing" }).click();
  await page.waitForURL(/\/drafts\/[\w-]+$/);
  await expect(page.getByRole("heading", { name: "Reading your draft." })).toBeVisible();
  return page.url();
}

export async function openLens(page: Page, name: RegExp) {
  await page.getByRole("tab", { name }).click();
  await expect(page.locator('article[id^="item-"]').first()).toBeVisible();
}
