import { expect, type Page } from "@playwright/test";

// Seeded by scripts/ha-dev/bootstrap.py: dev is the owner and a Space Admin, user1 a plain user.
export const SPACE_ADMIN = { username: "dev", password: "dev" };
export const USER = { username: "user1", password: "user1" };

export async function logIn(page: Page, account: { username: string; password: string }): Promise<void> {
  await page.goto("/");
  await page.locator('input[name="username"]').fill(account.username);
  await page.locator('input[name="password"]').fill(account.password);
  await page.keyboard.press("Enter");
  await expect(page).not.toHaveURL(/auth\/authorize/);
}
