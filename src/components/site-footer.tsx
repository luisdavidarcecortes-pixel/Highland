import Image from 'next/image';
import { Instagram } from 'lucide-react';
import { Link } from '@/components/page-transitions';

export function SiteFooter() {
  return (
    <footer className="site-footer relative z-10 mt-16 text-[#fffdf8]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-12">
          <div className="grid gap-8 border-b border-white/20 pb-8 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#fffdf8]/70">
                The Highlander · Student newspaper
              </p>
              <h2 className="masthead mt-2 text-3xl font-bold text-[#fffdf8] md:text-4xl">
                Highland Academy
              </h2>
              <p className="mt-4 text-sm text-[#fffdf8]/85">
                211 Highland Circle Dr, Portland, TN 37148
                <span className="mx-2 text-[#fffdf8]/40">·</span>
                615-325-2036
              </p>
              <nav aria-label="Footer navigation" className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium"><Link href="/read" className="hover:underline">Latest issue</Link><Link href="/archive" className="hover:underline">Archive</Link><Link href="/news" className="hover:underline">News</Link><Link href="/admin" className="hover:underline">Editors' workspace ↗</Link></nav>
              <a
                href="https://www.instagram.com/highlandacademy"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 text-sm text-[#fffdf8]/90 transition-colors hover:text-white"
                aria-label="Instagram (opens in a new tab)"
              >
                <Instagram size={18} />
                <span>Instagram</span>
              </a>
            </div>
            <Image
              src="/brand/logo-white.png"
              alt="Highland Academy logo"
              width={567}
              height={201}
              className="h-14 w-auto opacity-90 md:h-16"
            />
          </div>
          <div className="flex flex-col gap-2 pt-5 text-xs text-[#fffdf8]/70 sm:flex-row sm:items-center sm:justify-between">
            <p>Student newspaper · &ldquo;Educating for a Higher Purpose&rdquo;</p>
            <p>© {new Date().getFullYear()} Highland Academy. All rights reserved.</p>
          </div>
          <p className="mt-3 text-xs text-[#fffdf8]/60">
            Hecho por Luis David Arce Cortés.
          </p>
      </div>
    </footer>
  );
}
