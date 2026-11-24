import { expect, test } from "@playwright/test";
import { SPACE_ADMIN, USER, logIn } from "./login";

for (const [who, account] of [
  ["Space Admin", SPACE_ADMIN],
  ["user", USER],
] as const) {
  test.describe(who, () => {
    test("lands on Share Space after login", async ({ page }) => {
      await logIn(page, account);
      await expect(page).toHaveURL(/\/share-space/);
    });

    test("can log out from Share Space", async ({ page }) => {
      await logIn(page, account);
      await page.goto("/share-space");
      await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    });

    test("sees the Planning card on Overview", async ({ page }) => {
      await logIn(page, account);
      await page.goto("/share-space");
      const planning = page.locator("share-space-overview-planning");
      await expect(planning.getByRole("heading", { name: "Planning" })).toBeVisible();
      await expect(planning.getByRole("combobox", { name: "Area" })).toBeVisible();
      await expect(planning.getByLabel(/^Next \d+ days$/)).toBeVisible();
    });
  });
}

test("Space Admin sees everyone's planning, read only", async ({ page }) => {
  await logIn(page, SPACE_ADMIN);
  await page.goto("/share-space");
  const people = page.locator("share-space-people-planning");
  await expect(people.getByRole("heading", { name: "Everyone's planning" })).toBeVisible();
  const user1 = people.locator("details", { hasText: "User 1" });
  await user1.locator("summary").click();
  await expect(user1.getByLabel(/^Next \d+ days$/)).toBeVisible();
  await expect(user1.locator("week-schedule, day-schedule")).toHaveCount(0);
});

test("a user does not see other people's planning", async ({ page }) => {
  await logIn(page, USER);
  await page.goto("/share-space");
  await expect(page.locator("share-space-overview-planning").getByRole("heading", { name: "Planning" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everyone's planning" })).toHaveCount(0);
});
