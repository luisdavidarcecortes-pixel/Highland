'use client';

import { useEffect, useRef, useState } from 'react';

type RevealTag = 'div' | 'section' | 'nav' | 'article' | 'header' | 'footer' | 'aside' | 'main';

type RevealProps = {
  as?: RevealTag;
  className?: string;
  delay?: number;
  amount?: number;
  children: React.ReactNode;
};

export function Reveal({
  as: Component = 'div',
  className = '',
  delay = 0,
  amount = 0.18,
  children,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Reduced motion: leave the content visible from the server render.
    if (mediaQuery.matches) return;

    const node = ref.current;
    if (!node) return;

    // Content already on screen is left alone: hiding it first would either
    // flash or delay the first paint, and an entrance animation is only
    // meaningful for content the reader reaches by scrolling.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    setVisible(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: amount,
        rootMargin: '0px 0px -8% 0px',
      }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [amount]);

  return (
    <Component
      ref={ref as any}
      className={['reveal', visible ? 'is-visible' : '', className].filter(Boolean).join(' ')}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Component>
  );
}
