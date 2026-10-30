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
        className="mb-5 flex items-center justify-between gap-4 border-b border-ink/15 pb-5"
      >
        <div>
          <Link href="/archive" className="inline-flex items-center gap-1 text-sm font-semibold text-ink/60 hover:text-ink">
            <ArrowLeft size={14} /> Archive
          </Link>
          <h1 className="masthead mt-2 text-3xl font-bold md:text-4xl">{edition?.title}</h1>
          <p className="text-sm text-ink/60">
            {issue && `${issue} · `}
            {edition ? formatMonthEs(edition.edition_date) : ''} · School year {edition?.school_year}
            {!edition?.published && ' · DRAFT'}
          </p>
        </div>
      </div>

      {edition && <Flipbook key={edition.id} pdfUrl={edition.pdf_url} title={edition.title} editionId={edition.id} />}

      <p className="text-center text-xs text-ink/50 mt-4">
        Use the keyboard arrows, drag the page corner, or tap the buttons to flip through the pages.
      </p>
    </div>
  );
}
