import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_OPERATOR } from '../playwright.config';
import { apiAsAdmin, loginAs, loginViaUi, resetBackend, roleByKey, seedPerson } from './support/api';

/**
 * The Print AprilTag feature on Access Control → People.
 *
 * These drive the real UI against the throwaway e2e backend: they never touch a
 * real person, and the tag rendered is the same 36h11 marker the camera decodes.
 */

let api: APIRequestContext;

/** A tag id well inside the 36h11 range (0–586), owned by this suite. */
const VALID_TAG_ID = 7;

test.beforeAll(async () => {
  api = await apiAsAdmin();
});

test.afterAll(async () => {
  await resetBackend(api);
  await api.dispose();
});

test.beforeEach(async () => {
  await resetBackend(api);
});

async function seedTaggedPerson() {
  const staff = await roleByKey(api, 'staff');
  await seedPerson(api, { name: 'Tagged Alice', roleId: staff._id, aprilTagId: VALID_TAG_ID });
}

async function seedUntaggedPerson() {
  const staff = await roleByKey(api, 'staff');
  await seedPerson(api, { name: 'Untagged Bob', roleId: staff._id });
}

test.describe('access control: print AprilTag', () => {
  test('an admin sees a print action for a person with an assigned tag', async ({ page }) => {
    await seedTaggedPerson();
    await loginViaUi(page);
    await page.goto('/access-control?tab=people');

    const row = page.getByRole('row', { name: /Tagged Alice/ });
    await expect(row.getByRole('button', { name: 'Print AprilTag' })).toBeVisible();
  });

  test('shows no print action for a person without a tag', async ({ page }) => {
    await seedUntaggedPerson();
    await loginViaUi(page);
    await page.goto('/access-control?tab=people');

    const row = page.getByRole('row', { name: /Untagged Bob/ });
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Print AprilTag' })).toHaveCount(0);
  });

  test('an operator gets no print action, even for a tagged person', async ({ page }) => {
    await seedTaggedPerson();
    await loginAs(page, E2E_OPERATOR);
    await page.goto('/access-control?tab=people');

    const row = page.getByRole('row', { name: /Tagged Alice/ });
    // The operator can still see the person (and their tag id) — just no controls.
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Print AprilTag' })).toHaveCount(0);
  });

  test('the preview shows the matching tag id and print-safe markup', async ({ page }) => {
    await seedTaggedPerson();
    await loginViaUi(page);
    await page.goto('/access-control?tab=people');

    await page.getByRole('row', { name: /Tagged Alice/ }).getByRole('button', { name: 'Print AprilTag' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('AprilTag 36h11');
    await expect(dialog).toContainText('Tagged Alice');
    await expect(dialog.getByTestId('apriltag-id')).toHaveText(String(VALID_TAG_ID));

    // Print-safe markup: a real vector SVG carrying the generator's white quiet
    // border — not a rasterised image or an arbitrary placeholder.
    const svg = dialog.getByTestId('apriltag-preview').locator('svg');
    await expect(svg).toBeVisible();
    const markup = await svg.evaluate((el) => el.outerHTML);
    expect(markup).toContain('viewBox="0 0 10 10"');
    expect(markup).toContain('fill="white"');

    // A dedicated one-tag-per-page print sheet exists and carries the same id.
    const sheet = page.getByTestId('apriltag-print-sheet');
    await expect(sheet).toContainText(`ID ${VALID_TAG_ID}`);
    await expect(sheet.locator('svg')).toHaveCount(1);
  });
});
