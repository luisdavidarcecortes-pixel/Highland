import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getEditionById } from '@/lib/data-editions';
import { isDemoMode } from '@/lib/demo';
import { Flipbook } from '@/components/flipbook/flipbook';
import { formatMonthEs, issueLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const edition = await getEditionById(params.id);
  if (!edition || !edition.published) return { title: 'Issue not found' };
  const issue = issueLabel(edition.number);
  return {
    title: issue ? `${issue} · ${edition.title}` : edition.title,
    description: edition.description ?? undefined,
    openGraph: {
      images: edition.cover_url ? [edition.cover_url] : undefined,
    },
  };
}

export default async function ReadEditionPage({ params }: Props) {
  const edition = await getEditionById(params.id);
  const demo = isDemoMode();

  if (!edition || (!edition.published && !demo)) notFound();
  const issue = edition ? issueLabel(edition.number) : null;

  return (
    <div className="public-page relative mx-auto max-w-6xl px-4 py-8">
      <div
        data-lg-surface
        className="lg-glass flex items-center justify-between gap-4 mb-5 rounded-2xl border border-ink/15 p-5"
      >
        <div>
          <Link href="/archive" className="text-sm text-ink/60 hover:text-ink inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Archive
          </Link>
          <h1 className="masthead text-2xl md:text-3xl font-bold mt-1">{edition?.title}</h1>
          <p className="text-sm text-ink/60">
            {issue && `${issue} · `}
            {edition ? formatMonthEs(edition.edition_date) : ''} · School year {edition?.school_year}
            {!edition?.published && ' · DRAFT'}
          </p>
        </div>
      </div>

      {edition && <Flipbook pdfUrl={edition.pdf_url} title={edition.title} editionId={edition.id} />}

      <p className="text-center text-xs text-ink/50 mt-4">
        Use the keyboard arrows, drag the page corner, or tap the buttons to flip through the pages.
      </p>
    </div>
  );
}
