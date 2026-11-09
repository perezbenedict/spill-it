import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import StageFeedback from '@/components/platform/StageFeedback';

afterEach(() => { vi.useRealTimers(); });

test('background rerenders do not prolong success feedback and dismissal uses the current callback', () => {
  vi.useFakeTimers();
  const first = vi.fn();
  const latest = vi.fn();
  const view = render(<StageFeedback message="Atmosphere applied." onDismiss={first}/>);
  act(() => vi.advanceTimersByTime(3000));
  view.rerender(<StageFeedback message="Atmosphere applied." onDismiss={latest}/>);
  act(() => vi.advanceTimersByTime(2000));
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledTimes(1);
});

test('success expiry does not dismiss a persistent error', () => {
  vi.useFakeTimers();
  const dismissSuccess = vi.fn();
  const dismissError = vi.fn();
  render(<StageFeedback message="Earlier action saved." error="The next action failed." onMessageDismiss={dismissSuccess} onDismiss={dismissError}/>);
  act(() => vi.advanceTimersByTime(10000));
  expect(dismissSuccess).toHaveBeenCalledTimes(1);
  expect(dismissError).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('The next action failed.');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss stage error' }));
  expect(dismissError).toHaveBeenCalledTimes(1);
});
