import { test, expect } from '@playwright/test';

test.describe('Drafts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/drafts');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.locator('main').getByText('我的草稿').first()).toBeVisible();
  });

  test('shows new button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /新建/ })).toBeVisible();
  });
});

test.describe('Shared', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/shared');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.locator('main').getByText('与我分享').first()).toBeVisible();
  });
});

test.describe('Trash', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/trash');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.locator('main').getByText('回收站').first()).toBeVisible();
  });

  test('shows warning banner', async ({ page }) => {
    await expect(page.getByText(/30 天后永久删除/)).toBeVisible();
  });

  test('shows clear trash button', async ({ page }) => {
    await expect(page.getByRole('button', { name: '清空回收站' })).toBeVisible();
  });
});
