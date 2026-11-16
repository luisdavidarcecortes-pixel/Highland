import { Link } from '@/components/page-transitions';
import { ArrowLeft, BookOpen } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="public-page mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
      <p className="editorial-kicker">404 · Page not found</p>
      <h1 className="masthead mt-3 text-4xl font-bold md:text-5xl">This page is not in the archive.</h1>
      <p className="mt-4 max-w-md text-ink/70">
        The link may be old, or the issue may have been unpublished. Every published issue is still
        available in the archive.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/archive"
          className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-semibold text-paper transition-colors hover:bg-brand-dark"
        >
          <BookOpen size={18} /> Browse the archive
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-6 py-3 font-semibold transition-colors hover:bg-ink/5"
        >
          <ArrowLeft size={16} /> Back home
        </Link>
      </div>
    </div>
  );
}
