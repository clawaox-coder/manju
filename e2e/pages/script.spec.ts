import { test, expect } from '@playwright/test';

test.describe('Script', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/script');
  });

  test('renders script editor heading', async ({ page }) => {
    await expect(page.locator('main').getByText('剧本创作')).toBeVisible();
  });

  test('shows auto-save badge', async ({ page }) => {
    const badge = page.getByText(/自动保存|未保存|加载中/);
    await expect(badge.first()).toBeVisible();
  });

  test('shows editor toolbar', async ({ page }) => {
    await expect(page.getByRole('button', { name: /插入分镜/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '加粗' })).toBeVisible();
    await expect(page.getByRole('button', { name: '斜体' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI 重写' })).toBeVisible();
  });

  test('shows next step button to storyboard', async ({ page }) => {
    const btn = page.getByRole('button', { name: /生成分镜/ });
    await expect(btn).toBeVisible();
  });

  test('shows AI assistant panel', async ({ page }) => {
    await expect(page.getByText('AI 创作助手', { exact: true })).toBeVisible();
  });

  test('shows AI quick actions', async ({ page }) => {
    await expect(page.getByRole('button', { name: '续写下一场' })).toBeVisible();
    await expect(page.getByRole('button', { name: '生成对白' })).toBeVisible();
    await expect(page.getByRole('button', { name: '优化情节' })).toBeVisible();
    await expect(page.getByRole('button', { name: '提取分镜' })).toBeVisible();
  });

  test('shows chat input', async ({ page }) => {
    await expect(page.getByPlaceholder('向 AI 提问...')).toBeVisible();
  });

  test('shows editor stats', async ({ page }) => {
    await expect(page.getByText('scene-1.md')).toBeVisible();
  });
});
