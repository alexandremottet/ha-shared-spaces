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
  await page.getByRole("button", { name: "Plannings" }).click();
  const people = page.locator("share-space-people-planning");
  await expect(people.getByRole("heading", { name: "Everyone's planning" })).toBeVisible();
  const roster = people.locator("area-roster-view");
  await expect(roster.locator("person-lane-track.total").first()).toBeVisible();
  await expect(roster.locator("person-lane-track", { hasText: "User 1" }).first()).toBeVisible();
  await expect(roster.locator("week-schedule, day-schedule")).toHaveCount(0);
});

test("a user does not see other people's planning", async ({ page }) => {
  await logIn(page, USER);
  await page.goto("/share-space");
  await expect(page.locator("share-space-overview-planning").getByRole("heading", { name: "Planning" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Plannings" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Everyone's planning" })).toHaveCount(0);
});

test("Overview shows heating before the Planning card", async ({ page }) => {
  await logIn(page, SPACE_ADMIN);
  await page.goto("/share-space");
  const heating = page.locator("share-space-overview section.panel", { has: page.getByRole("heading", { name: /^(Heating|Other areas)$/ }) });
  const planning = page.locator("share-space-overview section.panel", { has: page.locator("share-space-overview-planning") });
  await expect(planning).toBeVisible();
  const [h, p] = [await heating.boundingBox(), await planning.boundingBox()];
  expect(h!.y).toBeLessThan(p!.y);
});

test("each heating zone on Overview has its temperature graph", async ({ page }) => {
  await logIn(page, SPACE_ADMIN);
  await page.goto("/share-space");
  const zones = page.locator("share-space-overview .zone");
  await expect(zones.first()).toBeVisible();
  const count = await zones.count();
  await expect(page.locator("share-space-overview .zone share-space-ha-card hui-sensor-card")).toHaveCount(count);
});
