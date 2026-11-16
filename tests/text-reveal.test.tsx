// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TextReveal } from '../src/components/text-reveal';

afterEach(() => cleanup());

describe('headline reveal', () => {
  it('renders the headline visible: the hidden state never reaches the markup', () => {
    const { container } = render(<TextReveal lines={['Our campus.', 'Our stories.']} />);
    const heading = container.querySelector('h1');
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toContain('Our campus.');
    // No inline opacity: the server HTML must stay readable without CSS.
    expect(heading!.getAttribute('style') ?? '').not.toContain('opacity');
    expect(container.querySelectorAll('.text-reveal-line')).toHaveLength(2);
  });

  it('keeps a space between the lines for screen readers', () => {
    const { container } = render(<TextReveal lines={['Our campus.', 'Our stories.']} />);
    expect(container.querySelector('h1')!.textContent).toBe('Our campus. Our stories.');
  });

  it('marks the headline as revealed once it is on screen', () => {
    const { container } = render(<TextReveal lines={['Latest news']} />);
    // The observer is not available in jsdom, so the component reveals the
    // headline immediately instead of leaving it hidden.
    expect(container.querySelector('h1')!.className).toContain('is-inview');
  });

  it('supports another heading level', () => {
    const { container } = render(<TextReveal as="h2" lines={['Latest news']} />);
    expect(container.querySelector('h2')).not.toBeNull();
    expect(container.querySelector('h1')).toBeNull();
  });
});
