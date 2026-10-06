import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { VideoBackground } from '@/components/video-background';
import { GlassSurfaces, LiquidGlassDefs } from '@/components/liquid-glass';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'The Highlander · Highland Academy Student Newspaper',
    template: 'The Highlander · %s',
  },
  description:
    'The Highland Academy digital newspaper: flip through every issue page by page and follow our news between editions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen flex flex-col">
        <VideoBackground />
        <LiquidGlassDefs />
        <GlassSurfaces />
        <SiteHeader />
        <main className="relative z-10 flex-1 mt-[20px]">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
