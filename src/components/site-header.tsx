'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/read', label: 'Read' },
  { href: '/archive', label: 'Archive' },
  { href: '/news', label: 'News' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // A route change should never leave the mobile menu hanging open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="site-header relative z-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="relative flex min-h-[88px] items-center justify-center py-4 md:min-h-[112px] md:py-5">
        <Link
          href="/"
          className="absolute -left-10 hidden items-center gap-3 md:flex"
          aria-label="Highland Academy home"
        >
          <Image
            src="/brand/logo-white.png"
            alt="Highland Academy"
            width={226}
            height={80}
            priority
            className="h-[75px] w-auto"
          />
        </Link>

          <Link href="/" aria-label="The Highlander — home" className="block">
            <Image
              src="/brand/masthead-highlander-cut.png"
              alt="The Highlander"
              width={952}
              height={159}
              priority
              className="h-auto w-72 sm:w-80 md:w-[30rem] lg:w-[36rem]"
            />
          </Link>

          <div className="absolute right-0 flex items-center justify-end">
            <button
              className="rounded-full p-2 text-ink hover:bg-ink/5 md:hidden"
              onClick={() => setOpen(!open)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="mobile-navigation"
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        <nav aria-label="Main navigation" className="hidden items-center justify-center gap-8 py-3 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
              className={`border-b-2 px-1 py-1 text-xs font-semibold uppercase tracking-[0.14em] transition-all duration-300 ${
                pathname === link.href
                  ? 'border-[#005a33] text-[#005a33]'
                  : 'border-transparent text-ink/70 hover:border-[#005a33] hover:text-[#005a33]'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      {open && (
        <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-ink/10 bg-paper md:hidden">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              aria-current={pathname === link.href ? 'page' : undefined}
              className={`block border-b border-ink/10 px-5 py-3 text-sm font-semibold ${
                pathname === link.href ? 'text-brand' : 'text-ink'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
