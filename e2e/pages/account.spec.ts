import { test, expect } from '@playwright/test';

test.describe('Billing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/billing');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.locator('main').getByText('订阅与账单').first()).toBeVisible();
  });

  test('shows usage card', async ({ page }) => {
    await expect(page.getByText('本月用量')).toBeVisible();
    await expect(page.getByText('视频渲染')).toBeVisible();
    await expect(page.getByText('云端存储')).toBeVisible();
  });

  test('shows plan comparison', async ({ page }) => {
    await expect(page.locator('main').getByText('免费版').first()).toBeVisible();
    await expect(page.locator('main').getByText('专业版').first()).toBeVisible();
  });

  test('shows invoice history', async ({ page }) => {
    await expect(page.locator('main').getByText('账单历史').first()).toBeVisible();
  });
});

test.describe('ApiKeys', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/apikeys');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.locator('main').getByText('API 密钥').first()).toBeVisible();
  });

  test('shows generate key button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /生成新密钥/ })).toBeVisible();
  });

  test('shows security warning', async ({ page }) => {
    await expect(page.getByText('密钥安全提示')).toBeVisible();
  });

  test('shows quick start section', async ({ page }) => {
    await expect(page.getByText('快速开始')).toBeVisible();
  });
});

test.describe('Help', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/help');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.locator('main').getByText('帮助中心').first()).toBeVisible();
  });

  test('shows resource cards', async ({ page }) => {
    await expect(page.getByText('新手教程')).toBeVisible();
    await expect(page.getByText('视频教程')).toBeVisible();
  });

  test('shows keyboard shortcuts', async ({ page }) => {
    await expect(page.getByText('键盘快捷键')).toBeVisible();
  });

  test('shows FAQ section', async ({ page }) => {
    await expect(page.locator('main').getByText('常见问题').first()).toBeVisible();
  });
});

test.describe('Team', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/team');
  });

  test('renders heading', async ({ page }) => {
    await expect(page.locator('main').getByText('团队协作').first()).toBeVisible();
  });

  test('shows invite button', async ({ page }) => {
    await expect(page.getByRole('button', { name: '邀请成员' })).toBeVisible();
  });

  test('shows member list', async ({ page }) => {
    await expect(page.getByText('成员列表')).toBeVisible();
  });

  test('shows activity card', async ({ page }) => {
    await expect(page.getByText('最近动态')).toBeVisible();
  });
});
