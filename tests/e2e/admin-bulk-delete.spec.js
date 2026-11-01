import { expect, test } from '@playwright/test';
import {
  E2E,
  loginAsAdmin,
  requireFixture,
  requireLocalMutationTarget,
} from '../helpers/e2e-env.js';

test.describe.serial('secure admin deletion', () => {
  test.beforeEach(() => {
    requireLocalMutationTarget(test);
    requireFixture(test, E2E.adminPassword, 'SPILL_E2E_ADMIN_PASSWORD');
    requireFixture(test, E2E.adminSessionId, 'SPILL_E2E_ADMIN_SESSION_ID');
  });

  test('password input keeps focus through typing, paste, backspace and a failed check', async ({ page, context }) => {
    requireFixture(test, E2E.bulkSubmissionIds.length >= 3, 'SPILL_E2E_BULK_SUBMISSION_IDS');
    await loginAsAdmin(page);
    await page.goto(`/admin/sessions/${E2E.adminSessionId}/live`);

    const card = page.locator('article').filter({ hasText: 'Selected projected contribution' });
    await card.getByRole('button', { name: 'Delete submission' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete this contribution?' });
    const password = dialog.getByLabel('Admin password');
    await expect(password).toBeFocused();

    for (const character of 'wrong-password') {
      await password.type(character);
      await expect(password).toBeFocused();
    }
    await password.press('Backspace');
    await expect(password).toHaveValue('wrong-passwor');
    await expect(password).toBeFocused();

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => navigator.clipboard.writeText('pasted-password'));
    await password.press('ControlOrMeta+A');
    await password.press('ControlOrMeta+V');
    await expect(password).toHaveValue('pasted-password');
    await expect(password).toBeFocused();

    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(/incorrect.*password/i);
    await expect(dialog).toBeVisible();
    await expect(password).toHaveValue('pasted-password');
    await password.fill(E2E.adminPassword);
    await expect(password).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(card.getByRole('button', { name: 'Delete submission' })).toBeFocused();
  });

  test('bulk contribution deletion is scoped, confirmed and clears presentation state', async ({ page }) => {
    requireFixture(test, E2E.bulkSubmissionIds.length >= 3, 'SPILL_E2E_BULK_SUBMISSION_IDS');
    await loginAsAdmin(page);
    await page.goto(`/admin/sessions/${E2E.adminSessionId}/live`);

    const alpha = page.locator('article').filter({ hasText: 'Selected projected contribution' });
    const beta = page.locator('article').filter({ hasText: 'Selected second contribution' });
    const preserved = page.locator('article').filter({ hasText: 'Unselected contribution must survive' });

    const visibleCardCount = await page.locator('article').count();
    await page.getByRole('button', { name: 'Select all visible' }).click();
    await expect(page.getByText(`${visibleCardCount} selected on this page`)).toBeVisible();
    await page.getByRole('button', { name: 'Deselect all' }).click();
    await expect(page.getByText('0 selected on this page')).toBeVisible();

    await alpha.getByRole('checkbox').check();
    await beta.getByRole('checkbox').check();
    await expect(page.getByText('2 selected on this page')).toBeVisible();
    await page.getByRole('button', { name: 'Delete selected' }).click();

    let dialog = page.getByRole('dialog', { name: 'Delete selected contributions?' });
    await expect(dialog.getByLabel('Admin password')).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(alpha).toBeVisible();
    await expect(beta).toBeVisible();

    await page.getByRole('button', { name: 'Delete selected' }).click();
    dialog = page.getByRole('dialog', { name: 'Delete selected contributions?' });
    await dialog.getByLabel('Type DELETE').fill('DELETE');
    await dialog.getByLabel('Admin password').fill('not-the-password');
    await dialog.getByRole('button', { name: /Delete 2 contributions/ }).click();
    await expect(dialog.getByRole('alert')).toContainText(/incorrect.*password/i);
    await expect(dialog.getByLabel('Admin password')).toHaveValue('not-the-password');

    await dialog.getByLabel('Admin password').fill(E2E.adminPassword);
    await dialog.getByRole('button', { name: /Delete 2 contributions/ }).click();
    await expect(dialog).toBeHidden();
    await expect(alpha).toHaveCount(0);
    await expect(beta).toHaveCount(0);
    await expect(preserved).toBeVisible();
    await expect(page.getByText('0 selected on this page')).toBeVisible();

    const room = await page.context().newPage();
    await room.goto(`/room/${E2E.liveCode}`);
    await expect(room.locator('[data-presented-row]')).toHaveCount(0);
  });

  test('bulk session deletion excludes live discussions and preserves unselected sessions', async ({ page }) => {
    requireFixture(test, E2E.bulkSessionIds.length >= 3, 'SPILL_E2E_BULK_SESSION_IDS');
    await loginAsAdmin(page);
    await page.goto('/admin/sessions');

    await expect(page.getByRole('checkbox', { name: /Bulk Contribution Fixture is live/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Select all eligible' }).click();
    await expect(page.getByText('3 selected', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Deselect all' }).click();

    await page.getByRole('checkbox', { name: 'Select Delete Me Alpha' }).check();
    await page.getByRole('checkbox', { name: 'Select Delete Me Beta' }).check();
    await page.getByRole('button', { name: 'Delete selected' }).click();

    let dialog = page.getByRole('dialog', { name: 'Delete 2 selected discussions?' });
    await expect(dialog.getByText('Delete Me Alpha')).toBeVisible();
    await expect(dialog.getByText('Delete Me Beta')).toBeVisible();
    await expect(dialog.getByLabel('Admin password')).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Delete selected' }).click();
    dialog = page.getByRole('dialog', { name: 'Delete 2 selected discussions?' });
    await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
    await dialog.getByLabel('Admin password').fill('not-the-password');
    await dialog.getByRole('button', { name: 'Permanently delete selected' }).click();
    await expect(dialog.getByRole('alert')).toContainText(/incorrect.*password/i);
    await expect(dialog.getByLabel('Admin password')).toHaveValue('not-the-password');

    await dialog.getByLabel('Admin password').fill(E2E.adminPassword);
    await dialog.getByRole('button', { name: 'Permanently delete selected' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Delete Me Alpha', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Delete Me Beta', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Preserve Me Gamma', { exact: true })).toBeVisible();
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
  });
});
