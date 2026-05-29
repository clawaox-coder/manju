import { test, expect } from '@playwright/test';

test.describe('Projects', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
  });

  test('renders heading and project count', async ({ page }) => {
    await expect(page.locator('main').getByText('项目管理')).toBeVisible();
  });

  test('shows new project button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /新建项目/ })).toBeVisible();
  });

  test('shows filter controls', async ({ page }) => {
    const main = page.locator('main');
    await expect(main.getByRole('textbox').first()).toBeVisible();
  });

  test('can toggle view mode', async ({ page }) => {
    const main = page.locator('main');
    const buttons = main.getByRole('button');
    await expect(buttons.first()).toBeVisible();
  });
});
