import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import PendingQueue from '@/components/admin/dashboard/PendingQueue';

const actions = vi.hoisted(() => ({ approve: vi.fn(), hide: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/actions/moderation', () => ({ approve: actions.approve, hide: actions.hide }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: actions.refresh }) }));

const contribution = { id: '11111111-1111-4111-8111-111111111111', revision: 7, nickname: 'Fixture', category: 'question', content: 'A contribution waiting for review.', created_at: '2026-11-09T10:00:00Z' };
const queue = (item = contribution) => <PendingQueue items={[item]} pendingCount={1} feedHref="/admin/sessions/example/live"/>;
beforeEach(() => { vi.clearAllMocks(); });

for (const [label, action] of [['Approve', 'approve'], ['Reject', 'hide']]) {
  test(`${label} sends the displayed revision and removes the row only after confirmation`, async () => {
    let resolve;
    actions[action].mockImplementation(() => new Promise(done => { resolve = done; }));
    render(queue());
    fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
    expect(actions[action]).toHaveBeenCalledWith(contribution.id, 7);
    expect(screen.getByText(contribution.content)).toBeVisible();
    expect(actions.refresh).not.toHaveBeenCalled();
    await act(async () => resolve({ ok: true, row: { ...contribution, revision: 8 } }));
    expect(screen.queryByText(contribution.content)).not.toBeInTheDocument();
    expect(actions.refresh).toHaveBeenCalledTimes(1);
  });
}

test('a stale decision preserves feedback, refreshes the queue and requires an explicit retry using the refreshed revision', async () => {
  actions.approve.mockResolvedValueOnce({ error: 'Another moderator updated this contribution. Refresh and try again.', code: 'concurrent_change', refreshRequired: true }).mockResolvedValueOnce({ ok: true });
  const view = render(queue());
  fireEvent.click(screen.getByRole('button', { name: 'Approve', exact: true }));
  await waitFor(() => expect(actions.refresh).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('alert')).toHaveTextContent('Another moderator updated');
  expect(screen.getByText(contribution.content)).toBeVisible();
  expect(actions.approve).toHaveBeenCalledTimes(1);
  view.rerender(queue({ ...contribution, revision: 8 }));
  expect(actions.approve).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Approve', exact: true }));
  await waitFor(() => expect(actions.approve).toHaveBeenLastCalledWith(contribution.id, 8));
  await waitFor(() => expect(screen.queryByText(contribution.content)).not.toBeInTheDocument());
});

test('missing revision feedback remains actionable and refreshes without assuming a successful rejection', async () => {
  actions.hide.mockResolvedValue({ error: 'Refresh this contribution before making a moderation decision.', code: 'revision_required', refreshRequired: true });
  render(queue({ ...contribution, revision: undefined }));
  fireEvent.click(screen.getByRole('button', { name: 'Reject', exact: true }));
  await waitFor(() => expect(actions.refresh).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('alert')).toHaveTextContent('Refresh this contribution');
  expect(screen.getByText(contribution.content)).toBeVisible();
  expect(actions.hide).toHaveBeenCalledWith(contribution.id, undefined);
});

test('validation feedback does not become a generic error or remove a pending contribution', async () => {
  actions.approve.mockResolvedValue({ error: 'This moderation decision is not valid.', code: 'validation_failed', refreshRequired: true });
  render(queue());
  fireEvent.click(screen.getByRole('button', { name: 'Approve', exact: true }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This moderation decision is not valid.'));
  expect(screen.getByText(contribution.content)).toBeVisible();
});

test('an unconfirmed transport failure keeps the row available for review', async () => {
  actions.approve.mockRejectedValue(new Error('private transport detail'));
  render(queue());
  fireEvent.click(screen.getByRole('button', { name: 'Approve', exact: true }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
  expect(screen.getByText(contribution.content)).toBeVisible();
  expect(screen.getByRole('alert')).not.toHaveTextContent('private transport detail');
  expect(actions.refresh).not.toHaveBeenCalled();
});

test('repeated clicks issue only one in-flight moderation request', async () => {
  let resolve;
  actions.approve.mockImplementation(() => new Promise(done => { resolve = done; }));
  render(queue());
  const button = screen.getByRole('button', { name: 'Approve', exact: true });
  act(() => { fireEvent.click(button); fireEvent.click(button); });
  expect(actions.approve).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Reject', exact: true })).toBeDisabled();
  await act(async () => resolve({ ok: true }));
});
