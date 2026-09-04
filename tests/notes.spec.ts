import { test, expect } from '@playwright/test';

// Runs against the "chromium" project, which depends on the "setup"
// project (tests/auth.setup.ts) and starts each test already signed in.

test('creating a note survives a page refresh', async ({ page }) => {
  const noteTitle = `Playwright note ${Date.now()}`;

  // Opens the home page. Signed in, "/" redirects straight to
  // /protected/notes (see lib/supabase/proxy.ts) — there's no separate
  // public landing page to land on first.
  await page.goto('/');
  await expect(page).toHaveURL('/protected/notes');

  // Creates a new note.
  await page.getByLabel('Title').fill(noteTitle);
  await page
    .getByLabel('Body')
    .fill('Created by the Playwright happy-path test.');
  await page.getByRole('button', { name: 'Add note' }).click();

  await expect(page.getByText(noteTitle, { exact: true })).toBeVisible();

  // Refreshes the page.
  await page.reload();

  // Confirms the note is still visible.
  await expect(page.getByText(noteTitle, { exact: true })).toBeVisible();

  // Cleanup: the test account is a real, persistent Supabase user, so
  // remove the note this test created rather than letting them pile up
  // across runs.
  page.once('dialog', (dialog) => dialog.accept());
  const noteCard = page.locator('.rounded-xl', { hasText: noteTitle });
  await noteCard.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(noteTitle, { exact: true })).not.toBeVisible();
});
