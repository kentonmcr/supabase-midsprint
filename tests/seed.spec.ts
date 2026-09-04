import { test } from '@playwright/test';

// Minimal seed for playwright-cli's plan/generate/heal workflow (see
// .claude/skills/playwright-cli/references/test-generation.md). Runs under
// the "chromium" project, which already depends on "setup" (tests/auth.setup.ts)
// and loads the saved signed-in session — so this needs no login of its own.
test('seed', async ({ page }) => {
  await page.goto('/');
});
