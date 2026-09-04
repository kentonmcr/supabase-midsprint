import { test, expect } from '@playwright/test';

// Runs against the "chromium" project, which depends on the "setup"
// project (tests/auth.setup.ts) and starts each test already signed in.
//
// Selectors verified live via playwright-cli against the running dev
// server before writing this file (see
// .claude/skills/playwright-cli/references/test-generation.md).

test('deleting a note removes it from the list after a refresh', async ({
  page,
}) => {
  const noteTitle = `Delete test ${Date.now()}`;

  await page.goto('/');
  await expect(page).toHaveURL('/protected/notes');

  // 1. Create a note to delete.
  await page.getByLabel('Title').fill(noteTitle);
  await page.getByLabel('Body').fill('Created only to be deleted.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText(noteTitle, { exact: true })).toBeVisible();

  // 2. Delete it. Deleting shows a native confirm() dialog
  // (components/notes/note-row.tsx's handleDelete) — accept it.
  page.once('dialog', (dialog) => dialog.accept());
  const noteCard = page.locator('.rounded-xl', { hasText: noteTitle });
  await noteCard.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(noteTitle, { exact: true })).not.toBeVisible();

  // 3. Refresh the page.
  await page.reload();

  // 4. Confirm it no longer appears in the list.
  await expect(page.getByText(noteTitle, { exact: true })).not.toBeVisible();
});
