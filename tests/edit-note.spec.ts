import { test, expect } from '@playwright/test';

// Runs against the "chromium" project, which depends on the "setup"
// project (tests/auth.setup.ts) and starts each test already signed in.
//
// Selectors verified live via playwright-cli against the running dev
// server before writing this file (see
// .claude/skills/playwright-cli/references/test-generation.md).
//
// The edit form's Title/Body fields (components/notes/note-row.tsx) have
// no associated <Label>, unlike the "New note" form — getByLabel() doesn't
// work here. Instead, scope to the specific note's card by its (still
// plain-text) title before editing, then — once in edit mode — scope to
// the one card containing a "Save" button (title is no longer plain text
// once it's inside an <input>, so hasText can't match it there) and target
// the body field by tag: the edit card has exactly one <textarea>, even
// though the page overall has two (this card's, plus the always-present
// "New note" form's).

test("editing a note's body persists after a page refresh", async ({
  page,
}) => {
  const noteTitle = `Edit test ${Date.now()}`;
  const editedBody = 'This body was edited by the edit-note test.';

  await page.goto('/');
  await expect(page).toHaveURL('/protected/notes');

  // 1. Create a note to edit.
  await page.getByLabel('Title').fill(noteTitle);
  await page.getByLabel('Body').fill('Original body, before editing.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText(noteTitle, { exact: true })).toBeVisible();

  // 2. Open it and edit the body text.
  const noteCard = page.locator('.rounded-xl', { hasText: noteTitle });
  await noteCard.getByRole('button', { name: 'Edit' }).click();

  const editingCard = page
    .locator('.rounded-xl')
    .filter({ has: page.getByRole('button', { name: 'Save' }) });
  await editingCard.locator('textarea').first().fill(editedBody);
  await editingCard.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText(editedBody, { exact: true })).toBeVisible();

  // 3. Refresh the page.
  await page.reload();

  // 4. Confirm the edited text is still there.
  await expect(page.getByText(editedBody, { exact: true })).toBeVisible();

  // Cleanup: the test account is a real, persistent Supabase user, so
  // remove the note this test created rather than letting them pile up.
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .locator('.rounded-xl', { hasText: noteTitle })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByText(noteTitle, { exact: true })).not.toBeVisible();
});
