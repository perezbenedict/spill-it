import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dialog from '@/components/ui/Dialog';

vi.mock('framer-motion', async () => {
  const { forwardRef, createElement } = await import('react');
  return {
    AnimatePresence: ({ children }) => children,
    useReducedMotion: () => true,
    motion: {
      div: forwardRef(function MotionDiv(props, ref) {
        const attributes = { ...props };
        for (const key of ['initial', 'animate', 'exit', 'transition']) delete attributes[key];
        return createElement('div', { ...attributes, ref });
      }),
    },
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Example({ children, onClose = () => {} }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      <Dialog open={open} title="Event controls" onClose={() => { onClose(); setOpen(false); }}>
        {children}
      </Dialog>
    </>
  );
}

describe('Dialog keyboard accessibility', () => {
  it('does not steal focus when entry begins before the autofocus frame', () => {
    let initialFocus;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { initialFocus = callback; return 1; });
    render(<Dialog open title="Confirmation" onClose={() => {}}><input aria-label="Type DELETE" /><input aria-label="Admin password" data-dialog-autofocus /></Dialog>);
    const confirmation = screen.getByLabelText('Type DELETE');
    confirmation.focus();
    fireEvent.change(confirmation, { target: { value: 'DELETE' } });
    initialFocus();
    expect(confirmation).toHaveFocus();
    expect(confirmation).toHaveValue('DELETE');
  });
  it('closes on Escape and restores the opener', async () => {
    const onClose = vi.fn();
    const { container } = render(<Example onClose={onClose}><button>Confirm</button></Example>);
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus());
    expect(container).toHaveAttribute('inert');
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container).not.toHaveAttribute('inert');
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('keeps Tab and Shift+Tab inside an empty dialog', async () => {
    render(<Dialog open title="Empty dialog" onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog).toHaveFocus());
    for (const shiftKey of [false, true]) {
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
      dialog.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(dialog).toHaveFocus();
    }
  });

  it('skips hidden and disabled fields and traps focus at visible controls', async () => {
    render(
      <Dialog open title="Visible controls" onClose={() => {}}>
        <input aria-label="Disabled" disabled data-dialog-autofocus />
        <input aria-label="Hidden input" type="hidden" />
        <div hidden><button>Hidden ancestor</button></div>
        <div style={{ display: 'none' }}><input aria-label="CSS hidden" /></div>
        <button style={{ visibility: 'hidden' }}>Invisible</button>
        <button>First</button>
        <button>Last</button>
      </Dialog>
    );
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    await waitFor(() => expect(first).toHaveFocus());
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
  });

  it('restores pre-existing inert state and scroll style on unmount', () => {
    const background = document.createElement('div');
    background.setAttribute('inert', '');
    document.body.append(background);
    document.body.style.overflow = 'auto';
    const { unmount } = render(<Dialog open title="Temporary dialog" onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(background).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('auto');
    background.remove();
    document.body.style.overflow = '';
  });

  it('handles Escape only in the top dialog and preserves the outer focus trap', async () => {
    const outerClose = vi.fn();
    function Nested() {
      const [inner, setInner] = useState(false);
      return (
        <Dialog open title="Outer" onClose={outerClose}>
          <button onClick={() => setInner(true)}>Open inner</button>
          <Dialog open={inner} title="Inner" onClose={() => setInner(false)}><button>Inner action</button></Dialog>
        </Dialog>
      );
    }
    render(<Nested />);
    const opener = screen.getByRole('button', { name: 'Open inner' });
    await waitFor(() => expect(opener).toHaveFocus());
    fireEvent.click(opener);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Inner action' })).toHaveFocus());
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(outerClose).not.toHaveBeenCalled();
    await waitFor(() => expect(opener).toHaveFocus());
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(opener, { key: 'Tab' });
    expect(opener).toHaveFocus();
  });
});
