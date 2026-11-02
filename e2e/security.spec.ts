import { expect, test } from "@playwright/test";
import { E2E_PASSWORD } from "../playwright.config";

test("pages redirect to the access screen without a session", async ({ page }) => {
  for (const path of ["/", "/drafts", "/vocabulary"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/access/);
  }
});

test("the analysis endpoint rejects unauthorised and invalid requests", async ({ request }) => {
  const body = { text: "Je suis allé au marché.", lens: "grammar" };
  expect((await request.post("/api/analyze", { data: body })).status()).toBe(401);

  const forged = await request.post("/api/analyze", { data: body, headers: { cookie: "fwl_access=abc.123.def" } });
  expect(forged.status()).toBe(401);
  expect(await forged.text()).not.toContain(E2E_PASSWORD);

  const login = await request.post("/api/access", { data: { password: E2E_PASSWORD } });
  expect(login.status()).toBe(200);
  expect((await request.post("/api/analyze", { data: body })).status()).toBe(200);
  expect((await request.post("/api/analyze", { data: { text: "x", lens: "poetry" } })).status()).toBe(400);
  expect((await request.post("/api/analyze", { data: { text: "a".repeat(20_001), lens: "grammar" } })).status()).toBe(413);
  expect(
    (await request.post("/api/analyze", { data: body, headers: { origin: "https://evil.example" } })).status(),
  ).toBe(403);
});

test("wrong password is refused; right password unlocks; session cookie is HttpOnly", async ({ page, context }) => {
  await page.goto("/");
  await page.getByLabel("Access password").fill("not it");
  await page.getByRole("button", { name: "Enter" }).click();
  // (Next.js also renders a route-announcer with role=alert, hence the narrower locator.)
  await expect(page.locator("p[role=alert]")).toContainText("not correct");

  await page.getByLabel("Access password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByRole("heading", { name: "Your writing space." })).toBeVisible();

  const cookie = (await context.cookies()).find((c) => c.name === "fwl_access")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  expect(cookie.value).not.toContain(E2E_PASSWORD);
  expect(await page.evaluate(() => document.cookie)).not.toContain("fwl_access");

  await page.getByRole("button", { name: "Lock" }).click();
  await expect(page).toHaveURL(/\/access/);
  await page.goto("/drafts");
  await expect(page).toHaveURL(/\/access/);
});

test("no secret reaches the browser", async ({ page }) => {
  const res = await page.request.post("/api/access", { data: { password: E2E_PASSWORD } });
  expect(res.ok()).toBe(true);
  const sources: string[] = [];
  page.on("response", async (r) => {
    if (/\.(js|css)$/.test(new URL(r.url()).pathname) || r.request().resourceType() === "document") {
      sources.push(await r.text().catch(() => ""));
    }
  });
  for (const path of ["/", "/drafts", "/vocabulary", "/access"]) await page.goto(path);
  await page.waitForLoadState("networkidle");
  const all = sources.join("\n");
  expect(all.length).toBeGreaterThan(10_000);
  expect(all).not.toContain(E2E_PASSWORD);
  expect(all).not.toMatch(/sk-ant-/);
  expect(all).not.toContain("APP_ACCESS_PASSWORD");

  const status = await (await page.request.get("/api/status")).json();
  expect(JSON.stringify(status)).not.toContain(E2E_PASSWORD);
  expect(status.protection).toBe("password");
});
