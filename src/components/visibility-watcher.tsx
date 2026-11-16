'use client';

import { useEffect } from 'react';

/**
 * Tells the stylesheet that the tab is in the background.
 *
 * The ambient backdrop is animated forever: without this the browser keeps
 * compositing seven layers of light for a visitor who is not looking at the
 * page.
 */
export function VisibilityWatcher() {
  useEffect(() => {
    const update = () => {
      if (document.hidden) document.documentElement.dataset.hidden = 'true';
      else delete document.documentElement.dataset.hidden;
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return null;
}
