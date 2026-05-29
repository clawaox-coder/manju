import { test, expect } from '@playwright/test';

test('unauthenticated user is redirected to /auth', async ({ page }) => {
  await page.goto('/projects');
  await expect(page).toHaveURL('/auth');
});

test('protected route /script also redirects', async ({ page }) => {
  await page.goto('/script');
  await expect(page).toHaveURL('/auth');
});

test('protected route /settings also redirects', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL('/auth');
});
