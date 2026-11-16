import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import 'atropos/css';
import './globals.css';
import './ambient.css';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { LiquidGlassDefs } from '@/components/liquid-glass';
import { AmbientBackdrop } from '@/components/ambient-backdrop';
import { VisibilityWatcher } from '@/components/visibility-watcher';
import { MagazinePreload } from '@/components/magazine-preload';
import { PageTransitions } from '@/components/page-transitions';
import { siteUrl } from '@/lib/site';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
});

const siteUrlValue = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrlValue),
  applicationName: 'The Highlander',
  title: {
    default: 'The Highlander · Highland Academy Student Newspaper',
    template: 'The Highlander · %s',
  },
  description:
    'The Highland Academy digital newspaper: flip through every issue page by page and follow our news between editions.',
  openGraph: {
    type: 'website',
    siteName: 'The Highlander · Highland Academy',
    locale: 'en_US',
    url: '/',
    title: 'The Highlander · Highland Academy Student Newspaper',
    description:
      'Flip through every issue of the Highland Academy student newspaper and follow the news between editions.',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen flex flex-col">
        {/* Adds the `js` class before the first paint so the headline reveal can
            hide its lines safely. If the bundle never loads, the safety timer
            removes the class again and the text stays visible. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.documentElement.classList.add('js');setTimeout(function(){if(!document.documentElement.dataset.revealReady){document.documentElement.classList.remove('js')}},5000);",
          }}
        />
        <PageTransitions>
          <AmbientBackdrop />
        <VisibilityWatcher />
          <MagazinePreload />
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <LiquidGlassDefs />
          <SiteHeader />
          <main id="main-content" tabIndex={-1} className="relative z-10 flex-1">
            {children}
          </main>
          <SiteFooter />
        </PageTransitions>
      </body>
    </html>
  );
}
