import { test as setup } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

const TEST_USER = {
  name: `e2e_${Date.now()}`,
  email: `e2e_${Date.now()}@test.local`,
  password: 'TestPass123!x',
};

setup('register & authenticate', async ({ page }) => {
  await page.goto('/auth');
  await page.getByText('注册').click();
  await page.getByPlaceholder('你的名字').fill(TEST_USER.name);
  await page.getByPlaceholder('you@example.com').fill(TEST_USER.email);
  await page.getByPlaceholder('至少 10 位').fill(TEST_USER.password);
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await page.waitForURL('/', { timeout: 10_000 });
  await page.context().storageState({ path: authFile });
});
