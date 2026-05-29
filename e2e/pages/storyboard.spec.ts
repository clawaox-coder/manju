import { test, expect } from '@playwright/test';

test.describe('Storyboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/storyboard');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.getByText('AI 生成分镜')).toBeVisible();
  });

  test('shows back to script button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /返回剧本/ })).toBeVisible();
  });

  test('shows next step button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /生成视频/ })).toBeVisible();
  });

  test('shows style picker', async ({ page }) => {
    await expect(page.getByText('画面风格')).toBeVisible();
    await expect(page.getByRole('button', { name: '日系动漫' })).toBeVisible();
    await expect(page.getByRole('button', { name: '写实风' })).toBeVisible();
    await expect(page.getByRole('button', { name: '国风水墨' })).toBeVisible();
    await expect(page.getByRole('button', { name: '漫画分格' })).toBeVisible();
  });

  test('shows regenerate all button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /重新生成全部/ })).toBeVisible();
  });

  test('back button returns to script', async ({ page }) => {
    await page.getByRole('button', { name: /返回剧本/ }).click();
    await expect(page).toHaveURL('/script');
  });
});
