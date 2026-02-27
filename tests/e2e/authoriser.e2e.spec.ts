import { expect, test } from '@playwright/test'

test('authoriser can open queue from options', async ({ page }) => {
  await page.goto('/request-options')

  await expect(page.getByRole('heading', { name: /choose what you want to do/i })).toBeVisible()

  await page.getByRole('link', { name: /open authoriser queue/i }).click()

  await expect(page.getByRole('heading', { name: /authoriser queue/i })).toBeVisible()
})
