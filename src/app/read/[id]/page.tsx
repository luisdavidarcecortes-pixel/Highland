import { Link } from '@/components/page-transitions';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getEditionById } from '@/lib/data-editions';
import { isDemoMode } from '@/lib/demo';
import { Flipbook } from '@/components/flipbook/reader';
import { formatMonthEs, issueLabel } from '@/lib/utils';
import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const routeParams = await params;
  const edition = await getEditionById(routeParams.id);
  if (!edition || !edition.published) {
    return { title: 'Issue not found', robots: { index: false, follow: false } };
  }
  const issue = issueLabel(edition.number);
  const title = issue ? `${issue} · ${edition.title}` : edition.title;
  const description =
    edition.description?.trim() ||
    `Read ${issue ?? 'the latest issue'} of The Highlander, the Highland Academy student newspaper, page by page.`;
  const cover = edition.cover_url ? absoluteUrl(edition.cover_url) : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/read/${edition.id}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `/read/${edition.id}`,
      images: cover ? [{ url: cover, alt: `${edition.title} cover` }] : undefined,
    },
    twitter: {
      card: cover ? 'summary_large_image' : 'summary',
      title,
      description,
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function ReadEditionPage({ params }: Props) {
  const routeParams = await params;
  const edition = await getEditionById(routeParams.id);
  const demo = isDemoMode();

  if (!edition || (!edition.published && !demo)) notFound();
  const issue = edition ? issueLabel(edition.number) : null;

  return (
    <div className="public-page relative mx-auto max-w-6xl px-4 py-8">
      <div
        className="mb-5 flex items-center justify-between gap-4 pb-5"
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
