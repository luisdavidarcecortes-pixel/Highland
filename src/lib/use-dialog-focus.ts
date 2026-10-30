'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Makes an overlay a real modal for keyboard and screen-reader users:
 * moves focus inside, keeps Tab cycling within it, closes on Escape and
 * restores focus to the control that opened it.
 *
 * The reader's panels used to be plain divs: focus stayed on the toolbar
 * button behind them and Tab walked into the page underneath, so a keyboard
 * user could not reach the results they had just opened.
 */
export function useDialogFocus<T extends HTMLElement>(active: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusable = () => {
      if (!node) return [] as HTMLElement[];
      return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0 && el.getAttribute('aria-hidden') !== 'true'
      );
    };

    const first = focusable()[0];
    (first ?? node)?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === firstItem || current === node)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && current === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // The trigger may have unmounted (e.g. a thumbnail list replaced by the
      // next render); guard before restoring focus.
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [active]);

  return ref;
}
