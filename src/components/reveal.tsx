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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (mediaQuery.matches) {
      setVisible(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

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
