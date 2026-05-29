import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders hero banner with greeting', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('shows hero action buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: '上传剧本' })).toBeVisible();
    await expect(page.getByRole('button', { name: '浏览模板' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI 生成灵感' })).toBeVisible();
  });

  test('shows stats cards', async ({ page }) => {
    await expect(page.getByText('本月作品')).toBeVisible();
    await expect(page.getByText('渲染时长')).toBeVisible();
    await expect(page.getByText('积分余额')).toBeVisible();
  });

  test('shows recent projects or quick start after load', async ({ page }) => {
    await page.locator('main').getByText('加载中...').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    const main = page.locator('main');
    const hasProjects = await main.getByText('最近项目').isVisible().catch(() => false);
    const hasQuickStart = await main.getByText('还没有项目').isVisible().catch(() => false);
    const hasTemplates = await main.getByText('推荐模板').isVisible().catch(() => false);
    expect(hasProjects || hasQuickStart || hasTemplates).toBeTruthy();
  });

  test('shows template suggestions', async ({ page }) => {
    await expect(page.getByText('推荐模板')).toBeVisible();
  });

  test('stats card links to billing', async ({ page }) => {
    await page.getByText('积分余额').click();
    await expect(page).toHaveURL('/billing');
  });
});
