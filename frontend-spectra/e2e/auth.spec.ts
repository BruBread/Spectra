import { expect, test } from '@playwright/test';
import { E2E_ADMIN } from '../playwright.config';
import { loginViaUi } from './support/api';

test.describe('login and session handling', () => {
  test('sends an anonymous visitor to the login page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('does not embed credentials in the page', async ({ page }) => {
    await page.goto('/login');
    expect(await page.content()).not.toContain(E2E_ADMIN.password);
  });

  test('rejects a wrong password with the backend error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(E2E_ADMIN.email);
    await page.getByLabel('Password', { exact: true }).fill('definitely-wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.locator('form [class*="formError"]')).toContainText(/incorrect/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('signs in and issues an httpOnly session cookie', async ({ page, context }) => {
    await loginViaUi(page);
    await expect(page).not.toHaveURL(/\/login/);

    const cookie = (await context.cookies()).find((entry) => entry.name === 'spectra.sid');
    expect(cookie).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');

    // The whole point of httpOnly: script on the page cannot read it.
    expect(await page.evaluate(() => document.cookie)).not.toContain('spectra.sid');
  });

  test('keeps the session across a reload and on a deep link', async ({ page }) => {
    await loginViaUi(page);

    await page.reload();
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);
  });

  test('signs out and cannot re-enter with the back button', async ({ page }) => {
    await loginViaUi(page);

    await page.locator('[class*="profileTrigger"]').click();
    await page.getByRole('menuitem', { name: 'Logout' }).click();
    await page.waitForURL(/\/login/);

    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
