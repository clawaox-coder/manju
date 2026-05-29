import { test, expect } from '@playwright/test';

test.describe('Video', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/video');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.locator('main').getByText('视频生成').first()).toBeVisible();
  });

  test('shows shot list panel', async ({ page }) => {
    await expect(page.getByText('镜头列表')).toBeVisible();
  });

  test('shows inspector panel', async ({ page }) => {
    await expect(page.getByText('检查器')).toBeVisible();
  });

  test('shows inspector tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: '画面' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '音频' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'AI' })).toBeVisible();
  });

  test('shows render button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /渲染并导出/ })).toBeVisible();
  });

  test('shows smart edit button', async ({ page }) => {
    await expect(page.getByRole('button', { name: '智能剪辑' })).toBeVisible();
  });

  test('audio tab shows volume controls', async ({ page }) => {
    await page.getByRole('tab', { name: '音频' }).click();
    await expect(page.getByText('BGM 音量')).toBeVisible();
  });

  test('AI tab shows action buttons', async ({ page }) => {
    await page.getByRole('tab', { name: 'AI' }).click();
    await expect(page.getByRole('button', { name: /重新生成画面/ })).toBeVisible();
  });
});
