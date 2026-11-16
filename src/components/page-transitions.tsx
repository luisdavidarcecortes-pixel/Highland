'use client';

import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type ReactNode,
} from 'react';

/**
 * Page-to-page transitions built on the browser's View Transitions API.
 *
 * The idea mirrors `next-view-transitions`, but implemented locally because
 * the published package relies on React's `use()` hook, which does not exist
 * in React 18. The transition callback waits for a promise that the provider
 * resolves once the new route has been committed, so the browser never
 * snapshots the old page twice. Browsers without the API (or readers who ask
 * for reduced motion) simply keep Next's normal navigation.
 */

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => Promise<void> | void) => { finished: Promise<void> };
};

type TransitionControls = {
  begin: () => Promise<void>;
};

const TransitionContext = createContext<TransitionControls | null>(null);

// Safety net: if a route never commits (an error boundary, a failed fetch),
// the page must not stay frozen behind the old snapshot.
const TRANSITION_TIMEOUT = 900;

export function PageTransitions({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const releaseRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const release = useCallback(() => {
    clearTimer();
    const pending = releaseRef.current;
    releaseRef.current = null;
    pending?.();
  }, [clearTimer]);

  // A committed route means the new DOM is on screen: the browser can take
  // the "after" snapshot and start animating.
  useEffect(() => {
    release();
  }, [pathname, release]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const controls = useMemo<TransitionControls>(
    () => ({
      begin() {
        return new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            clearTimer();
            if (releaseRef.current === done) releaseRef.current = null;
            resolve();
          };

          // A new navigation supersedes the previous one; the browser skips
          // the transition that is still running.
          releaseRef.current?.();
          releaseRef.current = done;
          clearTimer();
          timerRef.current = setTimeout(done, TRANSITION_TIMEOUT);
        });
      },
    }),
    [clearTimer]
  );

  return <TransitionContext.Provider value={controls}>{children}</TransitionContext.Provider>;
}

type LinkProps = ComponentProps<typeof NextLink>;

export function Link({ href, replace, scroll, onNavigate, ...rest }: LinkProps) {
  const router = useRouter();
  const controls = useContext(TransitionContext);

  const handleNavigate: NonNullable<LinkProps['onNavigate']> = (event) => {
    // A caller can still veto the navigation.
    let vetoed = false;
    onNavigate?.({
      preventDefault: () => {
        vetoed = true;
        event.preventDefault();
      },
    });
    if (vetoed) return;

    if (!controls || !canAnimate()) return;

    const destination = internalDestination(href);
    if (!destination) return;

    // Next would navigate on its own; we take over to animate the change.
    event.preventDefault();
    const options = { scroll: scroll ?? true };

    void (document as ViewTransitionDocument).startViewTransition?.(() => {
      const finished = controls.begin();
      if (replace) router.replace(destination, options);
      else router.push(destination, options);
      return finished;
    });
  };

  return (
    <NextLink
      {...rest}
      href={href}
      replace={replace}
      scroll={scroll}
      onNavigate={handleNavigate}
    />
  );
}

function canAnimate() {
  if (typeof document === 'undefined') return false;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }
  return typeof (document as ViewTransitionDocument).startViewTransition === 'function';
}

function hrefToString(href: LinkProps['href']): string {
  if (typeof href === 'string') return href;
  const { pathname = '', query, hash = '' } = href;

  let search = '';
  if (typeof query === 'string') {
    search = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  } else if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) value.forEach((item) => params.append(key, String(item)));
      else if (value !== null && value !== undefined) params.append(key, String(value));
    }
    const serialized = params.toString();
    search = serialized ? `?${serialized}` : '';
  }

  return `${pathname}${search}${hash}`;
}

function internalDestination(href: LinkProps['href']) {
  const value = hrefToString(href);
  if (!value || value.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(value)) return null;

  const url = new URL(value, window.location.href);
  if (url.origin !== window.location.origin) return null;

  // Already here: let Next scroll instead of freezing the page for a fade.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}
