import { test, expect } from '@playwright/test';

test.describe('Consistency', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/consistency');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.locator('main').getByText('角色一致性检查').first()).toBeVisible();
  });

  test('shows recheck button', async ({ page }) => {
    await expect(page.getByRole('button', { name: '重新检测' })).toBeVisible();
  });

  test('shows score and issue cards', async ({ page }) => {
    await expect(page.getByText('综合一致性评分')).toBeVisible();
    await expect(page.getByText('检测到的问题')).toBeVisible();
    await expect(page.getByText('参与角色')).toBeVisible();
  });

  test('shows character details', async ({ page }) => {
    await expect(page.getByText('角色一致性详情')).toBeVisible();
  });
});

test.describe('Edit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/edit');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.locator('main').getByText('智能剪辑').first()).toBeVisible();
  });

  test('shows reset button', async ({ page }) => {
    await expect(page.getByRole('button', { name: '重置参数' })).toBeVisible();
  });

  test('shows one-click edit button', async ({ page }) => {
    await expect(page.getByRole('button', { name: '一键剪辑' })).toBeVisible();
  });

  test('shows style options', async ({ page }) => {
    await expect(page.locator('main').getByText('节奏感强').first()).toBeVisible();
    await expect(page.locator('main').getByText('电影感').first()).toBeVisible();
  });

  test('shows parameter sliders', async ({ page }) => {
    await expect(page.getByText('转场频率')).toBeVisible();
    await expect(page.getByText('字幕显著度')).toBeVisible();
    await expect(page.getByText('剪辑节奏')).toBeVisible();
  });
});
