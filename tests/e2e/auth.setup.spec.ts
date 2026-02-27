import { expect, test } from '@playwright/test'

test('authenticate and persist session', async ({ page, context }) => {
  test.setTimeout(10 * 60 * 1000)

  await page.goto('/')
  await page.getByRole('button', { name: /start now/i }).click()

   const signInButton = page.getByRole('button', { name: /sign in/i })
   const needsSignIn = await signInButton.isVisible({ timeout: 5000 }).catch(() => false)
   if (needsSignIn) {
    await signInButton.click()
   }

  await expect(
    page.getByRole('button', { name: /sign out/i }),
  ).toBeVisible({ timeout: 10 * 60 * 1000 })

  await page.goto('/')
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 60 * 1000 })

  await context.storageState({ path: 'playwright/.auth/user.json' })

  if (process.env.PW_AUTH_PAUSE === '1') {
    await page.pause()
  }
})
