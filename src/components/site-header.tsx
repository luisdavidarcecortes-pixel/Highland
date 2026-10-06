'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Reveal } from '@/components/reveal';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/read', label: 'Read' },
  { href: '/archive', label: 'Archive' },
  { href: '/news', label: 'News' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header relative z-10">
      <Reveal as="div" delay={0}>
        {/* Logo sits beside the masthead on wide screens; on narrow ones the
            masthead would collide with it, so only the masthead is shown. */}
        <Link
          href="/"
          className="absolute left-[28px] sm:left-[32px] z-10 hidden md:flex items-center gap-3"
          style={{ top: 'calc(50% - 20px)', transform: 'translateY(-50%)' }}
        >
          <Image
            src="/brand/logo-white.png"
            alt="Highland Academy"
            width={226}
            height={80}
            priority
            className="h-12 md:h-16 w-auto"
          />
          <span className="w-px h-10 bg-ink/20" />
        </Link>

        <div className="mx-auto max-w-6xl px-4 pt-5 pb-3 md:pt-6 md:pb-2 h-auto grid grid-cols-[1fr_auto_1fr] items-center gap-4 mt-[20px]">
          <div aria-hidden />

          <Link href="/" aria-label="The Highlander — home" className="block justify-self-center">
            <Image
              src="/brand/masthead-highlander-cut.png"
              alt="The Highlander"
              width={952}
              height={159}
              priority
              className="w-64 sm:w-80 md:w-[26rem] lg:w-[36rem] h-auto"
            />
          </Link>

          <div className="flex items-center justify-end gap-1">
            <button className="md:hidden p-2" onClick={() => setOpen(!open)} aria-label="Menu">
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </Reveal>

      <Reveal as="nav" delay={80} className="relative top-[40px] hidden md:flex justify-center gap-1 px-4 pb-4">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 text-sm transition-colors hover:text-brand ${
              pathname === l.href ? 'text-brand' : 'text-ink'
            }`}
          >
            {l.label}
          </Link>
        ))}
      </Reveal>
      {open && (
        <div className="md:hidden border-t border-ink/10 bg-paper">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-sm"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
