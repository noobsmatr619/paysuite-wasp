import { expect, test } from "@playwright/test";

/**
 * PaySuite product smoke (UI).
 * Requires app running: PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 (or client port).
 * Creates a unique user each run via signup.
 */
test.describe("PaySuite app smoke", () => {
  const email = `pw_${Date.now()}@paysuite.test`;
  const password = "PlaywrightPass123!";

  test("signup → dashboard → customers", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel(/email/i).fill(email);
    // Wasp auth forms often use name=password
    const pass = page.locator('input[type="password"]').first();
    await pass.fill(password);
    // confirm password if present
    const pass2 = page.locator('input[type="password"]').nth(1);
    if (await pass2.count()) {
      await pass2.fill(password);
    }
    await page.getByRole("button", { name: /sign up|create|register/i }).click();

    // land on dashboard or email verification page
    await page.waitForTimeout(1500);
    const url = page.url();
    // If verification required, go login after dummy verify is auto in Dummy provider
    if (url.includes("login") || url.includes("email-verification")) {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill(email);
      await page.locator('input[type="password"]').first().fill(password);
      await page.getByRole("button", { name: /log in|sign in/i }).click();
    }

    await page.waitForURL(/dashboard|account|login|email-verification/, {
      timeout: 20000,
    });

    // Try dashboard directly
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /dashboard/i }).first(),
    ).toBeVisible({ timeout: 20000 });

    await page.goto("/customers");
    await expect(
      page.getByRole("heading", { name: /customers/i }).first(),
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("link", { name: /add customer/i }).click();
    await page.waitForURL("**/customers/new");
    await page.getByLabel(/first name/i).fill("Play");
    await page.getByLabel(/last name/i).fill("Wright");
    await page.getByRole("button", { name: /save/i }).click();
    // either detail or list
    await page.waitForTimeout(1500);
    expect(page.url()).toMatch(/customers/);
  });
});
