import { test, expect } from '@playwright/test';

test.describe('Auth Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
  });

  test('shows login form by default', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('漫剧AI Studio');
    await expect(page.getByText('登录你的账号')).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('至少 10 位')).toBeVisible();
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  });

  test('validates empty email', async ({ page }) => {
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByText('请填写邮箱')).toBeVisible();
  });

  test('validates invalid email format', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('bad@bad');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByText('请输入有效的邮箱地址')).toBeVisible();
  });

  test('validates short password', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('a@b.com');
    await page.getByPlaceholder('至少 10 位').fill('short');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByText('密码至少需要 10 位')).toBeVisible();
  });

  test('can switch to register mode', async ({ page }) => {
    await page.getByText('注册').click();
    await expect(page.getByText('创建新账号')).toBeVisible();
    await expect(page.getByPlaceholder('你的名字')).toBeVisible();
  });

  test('can switch to forgot password mode', async ({ page }) => {
    await page.getByText('忘记密码?').click();
    await expect(page.getByText('重置密码')).toBeVisible();
    await expect(page.getByRole('button', { name: '发送重置链接' })).toBeVisible();
  });

  test('shows GitHub OAuth button on login', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'GitHub 登录' })).toBeVisible();
  });
});
