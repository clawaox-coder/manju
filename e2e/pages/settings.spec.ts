import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('renders heading and tabs', async ({ page }) => {
    await expect(page.getByText('设置').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '个人资料' })).toBeVisible();
    await expect(page.getByRole('button', { name: '偏好设置' })).toBeVisible();
    await expect(page.getByRole('button', { name: '外观主题' })).toBeVisible();
    await expect(page.getByRole('button', { name: '通知设置' })).toBeVisible();
    await expect(page.getByRole('button', { name: '安全与登录' })).toBeVisible();
    await expect(page.getByRole('button', { name: '集成与扩展' })).toBeVisible();
  });

  test('profile tab shows save/cancel buttons', async ({ page }) => {
    await page.getByRole('button', { name: '个人资料' }).click();
    await expect(page.getByRole('button', { name: '保存修改' })).toBeVisible();
    await expect(page.getByRole('button', { name: '取消' })).toBeVisible();
  });

  test('appearance tab shows theme cards', async ({ page }) => {
    await page.getByRole('button', { name: '外观主题' }).click();
    await expect(page.getByText('浅色')).toBeVisible();
    await expect(page.getByText('深色')).toBeVisible();
    await expect(page.getByText('跟随系统')).toBeVisible();
    await expect(page.getByText('紧凑')).toBeVisible();
    await expect(page.getByText('舒适')).toBeVisible();
    await expect(page.getByText('宽松')).toBeVisible();
  });

  test('security tab shows danger zone', async ({ page }) => {
    await page.getByRole('button', { name: '安全与登录' }).click();
    await expect(page.getByText('登录密码')).toBeVisible();
    await expect(page.getByText('两步验证')).toBeVisible();
    await expect(page.getByRole('button', { name: '注销账户' })).toBeVisible();
  });

  test('integrations tab shows services', async ({ page }) => {
    await page.getByRole('button', { name: '集成与扩展' }).click();
    await expect(page.getByText(/抖音|B站|飞书/).first()).toBeVisible();
  });
});
