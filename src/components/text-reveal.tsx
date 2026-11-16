'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type TextRevealTag = 'h1' | 'h2' | 'h3';

type TextRevealProps = {
  as?: TextRevealTag;
  lines: ReactNode[];
  className?: string;
  /** Milliseconds between two lines. */
  stagger?: number;
};

/**
 * Headline entrance: every line rises into place when the headline scrolls
 * into view.
 *
 * The hidden state lives in CSS and is only applied when the document carries
 * the `js` class, which an inline script in the root layout adds. The server
 * therefore always delivers readable text: without JavaScript, or if the
 * bundle fails to load, the headline simply stays visible instead of
 * disappearing at `opacity: 0`. The script also removes the class again after
 * a few seconds if the component never mounts, so a failed hydration can
 * never hide the content.
 */
export function TextReveal({ as: Tag = 'h1', lines, className = '', stagger = 90 }: TextRevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Tells the inline safety net that the reveal is running.
    document.documentElement.dataset.revealReady = '1';

    if (!('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }

    // A headline that is already on screen plays its entrance right away.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.92) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25, rootMargin: '0px 0px -8% 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={['text-reveal', inView ? 'is-inview' : '', className].filter(Boolean).join(' ')}
      style={{ '--reveal-stagger': `${stagger}ms` } as CSSProperties}
    >
      {lines.map((line, index) => (
        <span
          key={index}
          className="text-reveal-line"
          style={{ '--line-index': index } as CSSProperties}
        >
          {line}
          {/* Keeps a space between the lines for screen readers. */}
          {index < lines.length - 1 ? ' ' : null}
        </span>
      ))}
    </Tag>
  );
}
