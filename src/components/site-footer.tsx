import Image from 'next/image';
import { Instagram } from 'lucide-react';
import { Reveal } from '@/components/reveal';

export function SiteFooter() {
  return (
    <footer className="site-footer relative z-10 mt-16 bg-night text-white">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <Reveal as="div" delay={0}>
          <h2 className="masthead text-3xl md:text-4xl font-bold text-white">
            Highland Academy
          </h2>
          <p className="mt-6 text-paper/90">211 Highland Circle Dr, Portland, TN 37148</p>
          <p className="mt-4 text-paper/90">p | 615-325-2036</p>
          <Image
            src="/brand/logo-white.png"
            alt="Highland Academy logo"
            width={567}
            height={201}
            className="h-16 md:h-20 w-auto mt-8"
          />
          <p className="mt-4 text-xs text-paper/60">
            Student newspaper · &ldquo;Educating for a Higher Purpose&rdquo;
          </p>
          <a
            href="https://www.instagram.com/highlandacademy"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 text-paper/90 hover:text-white transition-colors"
            aria-label="Instagram"
          >
            <Instagram size={20} />
            <span>Instagram</span>
          </a>

          <p className="mt-10 pt-6 border-t border-white/15 text-xs text-paper/60">
            © {new Date().getFullYear()} Highland Academy. All rights reserved.
          </p>
          <p className="mt-3 text-xs text-paper/60">
            Hecho por Luis David Arce Cortés.
          </p>
        </Reveal>
      </div>
    </footer>
  );
}
