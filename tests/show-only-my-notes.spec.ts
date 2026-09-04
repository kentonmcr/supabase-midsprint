import { test, expect } from '@playwright/test';

// The "other user" note is a durable fixture seeded directly into Postgres
// (bypassing RLS via the Supabase CLI), owned by the pre-existing
// sample.user@example.com account rather than the Playwright test account.
// This app's RLS already guarantees a signed-in user's own queries can
// never return another user's rows (see docs/data-model.md) — so this note
// can never reach the page regardless of the filter, and this test doubles
// as a regression check on that boundary (docs/data-model.md documents a
// real past incident where a leftover permissive policy briefly broke it).
const OTHER_USER_NOTE_TITLE = 'OTHER USER NOTE — should never be visible';

test('clicking "Show only my notes" hides other users\' notes and keeps my own', async ({
  page,
}) => {
  const myNoteTitle = `My own note ${Date.now()}`;

  await page.goto('/');
  await expect(page).toHaveURL('/protected/notes');

  await page.getByLabel('Title').fill(myNoteTitle);
  await page
    .getByLabel('Body')
    .fill('Created by the "Show only my notes" filter test.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText(myNoteTitle, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Show only my notes' }).click();

  await expect(
    page.getByText(OTHER_USER_NOTE_TITLE, { exact: true }),
  ).not.toBeVisible();
  await expect(page.getByText(myNoteTitle, { exact: true })).toBeVisible();

  // Cleanup: remove the note this test created (the test account is a
  // real, persistent Supabase user — see tests/notes.spec.ts).
  page.once('dialog', (dialog) => dialog.accept());
  const noteCard = page.locator('.rounded-xl', { hasText: myNoteTitle });
  await noteCard.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(myNoteTitle, { exact: true })).not.toBeVisible();
});
