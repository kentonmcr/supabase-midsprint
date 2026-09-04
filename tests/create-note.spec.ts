import { test, expect } from '@playwright/test';

// Runs against the "chromium" project, which depends on the "setup"
// project (tests/auth.setup.ts) and starts each test already signed in.
//
// Selectors verified live via playwright-cli against the running dev
// server before writing this file (see
// .claude/skills/playwright-cli/references/test-generation.md).

test('creating a note appears in the notes list', async ({ page }) => {
  const noteTitle = `Create test ${Date.now()}`;

  await page.goto('/');
  await expect(page).toHaveURL('/protected/notes');

  await page.getByLabel('Title').fill(noteTitle);
  await page.getByLabel('Body').fill('Created by the create-note test.');
  await page.getByRole('button', { name: 'Add note' }).click();

  await expect(page.getByText(noteTitle, { exact: true })).toBeVisible();

  // Cleanup: the test account is a real, persistent Supabase user, so
  // remove the note this test created rather than letting them pile up.
  page.once('dialog', (dialog) => dialog.accept());
  const noteCard = page.locator('.rounded-xl', { hasText: noteTitle });
  await noteCard.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(noteTitle, { exact: true })).not.toBeVisible();
});
