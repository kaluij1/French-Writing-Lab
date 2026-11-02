import { expect, test } from "@playwright/test";
import { countAnalyzeCalls, MIXED, openLens, signIn, writeAndSubmit } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("writing: autosave, refresh recovery, and a fresh page after submission", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your writing space." })).toBeVisible();
  const editor = page.locator("#editor");
  await editor.fill(MIXED);
  await expect(page.getByText(/Saved \d/)).toBeVisible();
  await expect(page.getByText(/\d+ words/)).toBeVisible();

  await page.reload();
  await expect(editor).toHaveValue(MIXED);

  // Keystrokes typed just before a refresh (before the debounced save) are recovered.
  await editor.fill(MIXED + " Fin.");
  await page.reload();
  await expect(editor).toHaveValue(MIXED + " Fin.");
  await expect(page.getByText(/Saved \d/)).toBeVisible();

  await page.getByRole("button", { name: "Analyze my writing" }).click();
  await page.waitForURL(/\/drafts\//);
  await page.getByRole("link", { name: "Write" }).click();
  await expect(editor).toHaveValue("");
});

test("analysis: each lens runs once, only when opened, and is cached", async ({ page }) => {
  const calls = countAnalyzeCalls(page);
  const url = await writeAndSubmit(page);
  expect(calls).toEqual([]); // submitting runs nothing

  for (const name of [/Grammar/, /Vocabulary/, /Language mixing/, /Sentence complexity/]) await openLens(page, name);
  expect(calls).toEqual(["grammar", "vocabulary", "mixing", "complexity"]);

  // Switching back and forth does not re-run.
  await openLens(page, /Grammar/);
  await openLens(page, /Language mixing/);
  expect(calls.length).toBe(4);

  // Reloading uses the stored analyses.
  await page.goto(url + "?lens=grammar");
  await expect(page.locator('article[id^="item-"]').first()).toBeVisible();
  await openLens(page, /Sentence complexity/);
  expect(calls.length).toBe(4);
});

test("analysis: a double click sends a single request", async ({ page }) => {
  const calls = countAnalyzeCalls(page);
  await writeAndSubmit(page);
  await page.getByRole("tab", { name: /Grammar/ }).dblclick();
  await expect(page.locator('article[id^="item-"]').first()).toBeVisible();
  expect(calls).toEqual(["grammar"]);
});

test("highlights point at the passage each card explains; the original text is shown verbatim", async ({ page }) => {
  await writeAndSubmit(page);
  await openLens(page, /Grammar/);
  await expect(page.locator(".prose-fr").first()).toHaveText(MIXED);

  const marks = page.locator("mark.hl");
  const n = await marks.count();
  expect(n).toBeGreaterThan(2);
  for (let k = 0; k < n; k++) {
    const mark = marks.nth(k);
    const index = await mark.getAttribute("data-index");
    const original = await page.locator(`#item-${index} .line-through`).textContent();
    expect((await mark.textContent())?.toLowerCase()).toBe(original?.toLowerCase());
  }
  // Clicking a highlight brings its explanation into focus.
  const first = marks.first();
  const idx = await first.getAttribute("data-index");
  await first.click();
  await expect(page.locator(`#item-${idx}`)).toBeInViewport();
});

test("lenses stay separate: Vocabulary does not repeat Language Mixing's English words", async ({ page }) => {
  await writeAndSubmit(page);
  await openLens(page, /Language mixing/);
  const mixing = page.locator('article[id^="item-"]');
  await expect(mixing.filter({ hasText: "grandmother" })).toHaveCount(1);
  await openLens(page, /Vocabulary/);
  await expect(page.locator('article[id^="item-"]').filter({ hasText: "grandmother" })).toHaveCount(0);
  await expect(page.getByText("Words you wrote in English")).toHaveCount(0);
});

test("errors are understandable and recoverable", async ({ page }) => {
  await writeAndSubmit(page);
  await page.route("**/api/analyze", (route) =>
    route.fulfill({ status: 502, json: { error: "The analysis came back in an unexpected format. Please try again.", retryable: true } }),
  );
  await page.getByRole("tab", { name: /Grammar/ }).click();
  await expect(page.getByText("unexpected format")).toBeVisible();

  // A 200 response that is not an analysis is never stored or rendered.
  await page.unroute("**/api/analyze");
  await page.route("**/api/analyze", (route) => route.fulfill({ status: 200, json: { hello: "world" } }));
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("unexpected format")).toBeVisible();

  await page.unroute("**/api/analyze");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator('article[id^="item-"]').first()).toBeVisible();
});

test("vocabulary: save from a lens, then find, filter and review it", async ({ page }) => {
  await writeAndSubmit(page);
  await openLens(page, /Language mixing/);
  await page.getByRole("button", { name: "+ Save to vocabulary" }).first().click();
  await expect(page.getByText("✓ In your vocabulary").first()).toBeVisible();

  await page.getByRole("link", { name: "My Vocabulary" }).click();
  await expect(page.getByRole("heading", { name: "My vocabulary." })).toBeVisible();
  const rows = page.locator("ul li");
  await expect(rows).toHaveCount(1);
  await page.getByPlaceholder(/Search/).fill("zzz");
  await expect(rows).toHaveCount(0);
  await page.getByPlaceholder(/Search/).fill("grand");
  await expect(rows).toHaveCount(1);
  await page.getByPlaceholder(/Search/).fill("");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("radio", { name: "To review" }).click();
  await expect(rows).toHaveCount(0);
  await page.getByRole("radio", { name: "Reviewed" }).click();
  await expect(rows).toHaveCount(1);
});

test("drafts: reopen, revise, re-analyze — the original submission is preserved", async ({ page }) => {
  const url = await writeAndSubmit(page);
  await openLens(page, /Grammar/);
  await page.getByRole("link", { name: "My Drafts" }).click();
  await page.getByRole("link", { name: "View analysis" }).first().click();
  await page.waitForURL(url);

  await page.getByRole("link", { name: "Continue editing" }).click();
  await expect(page.getByRole("heading", { name: "Revising your draft." })).toBeVisible();
  const revised = MIXED.replace("j'ai allé", "je suis allée");
  await page.locator("#editor").fill(revised);
  await expect(page.getByText(/Saved \d/)).toBeVisible();
  await page.getByRole("button", { name: "Analyze my writing" }).click();
  await page.waitForURL(url);

  await expect(page.locator(".prose-fr").first()).toHaveText(revised);
  // Regression: the page is kept alive between visits; the earlier Grammar result for the
  // first submission must not be shown next to the revised text.
  await expect(page.getByRole("tab", { name: /Grammar/ })).toContainText("Not yet opened");
  await expect(page.locator("mark.hl")).toHaveCount(0);
  await page.getByRole("button", { name: "Show original submission" }).click();
  await expect(page.locator(".prose-fr").first()).toHaveText(MIXED);

  await page.getByRole("link", { name: "My Drafts" }).click();
  // Re-submitted, so the working text equals the latest submission.
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
});

test("try it yourself: attempts persist, and belong to the analysis they were written for", async ({ page }) => {
  await writeAndSubmit(page);
  await openLens(page, /Sentence complexity/);
  await page.getByRole("button", { name: "Try it yourself" }).first().click();
  const box = page.getByPlaceholder("Your version…").first();
  await box.fill("J'ai acheté des fleurs, qui étaient très belles.");

  await page.reload();
  await expect(page.getByPlaceholder("Your version…").first()).toHaveValue("J'ai acheté des fleurs, qui étaient très belles.");

  // After Re-analyze, the old attempt is not shown under a (possibly different) new suggestion.
  await page.getByRole("button", { name: "Re-analyze" }).click();
  await expect(page.locator('article[id^="item-"]').first()).toBeVisible();
  await expect(page.getByPlaceholder("Your version…")).toHaveCount(0);
});
