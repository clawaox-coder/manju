import { test, expect } from '@playwright/test';

test.describe('Asset Libraries', () => {
  test('Characters page loads', async ({ page }) => {
    await page.goto('/characters');
    await expect(page.locator('main').getByText('角色库').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '上传角色' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI 生成角色' })).toBeVisible();
  });

  test('Scenes page loads', async ({ page }) => {
    await page.goto('/scenes');
    await expect(page.locator('main').getByText('场景库').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '上传场景' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI 生成场景' })).toBeVisible();
  });

  test('Props page loads', async ({ page }) => {
    await page.goto('/props');
    await expect(page.locator('main').getByText('道具库').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '上传道具' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI 生成道具' })).toBeVisible();
  });

  test('Music page loads', async ({ page }) => {
    await page.goto('/music');
    await expect(page.locator('main').getByText('音乐库').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '上传音乐' })).toBeVisible();
  });

  test('Sfx page loads', async ({ page }) => {
    await page.goto('/sfx');
    await expect(page.locator('main').getByText('音效库').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '上传音效' })).toBeVisible();
  });

  test('Voice page loads', async ({ page }) => {
    await page.goto('/voice');
    await expect(page.locator('main').getByText('配音与对白').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI 生成配音' })).toBeVisible();
    await expect(page.getByRole('button', { name: '上传配音' })).toBeVisible();
  });

  test('Voice TTS dialog opens', async ({ page }) => {
    await page.goto('/voice');
    await page.getByRole('button', { name: 'AI 生成配音' }).click();
    await expect(page.getByText('文本内容')).toBeVisible();
    await expect(page.getByText('语音角色')).toBeVisible();
    await expect(page.getByText('语速')).toBeVisible();
  });
});
