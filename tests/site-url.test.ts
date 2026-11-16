import { afterEach, describe, expect, it } from 'vitest';
import { siteUrl } from '@/lib/site';

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

describe('siteUrl', () => {
  it('uses the configured origin and trims trailing slashes', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://thehighlander.org/';
    expect(siteUrl()).toBe('https://thehighlander.org');
  });

  it('falls back to the domain Vercel assigns to the project', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'highland.vercel.app';
    expect(siteUrl()).toBe('https://highland.vercel.app');
  });

  it('uses the deployment url when there is no production domain yet', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.VERCEL_URL = 'highland-abc123.vercel.app';
    expect(siteUrl()).toBe('https://highland-abc123.vercel.app');
  });

  it('stops a production build that would publish localhost links', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    const previous = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    try {
      expect(() => siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', { value: previous, configurable: true });
    }
  });
});
