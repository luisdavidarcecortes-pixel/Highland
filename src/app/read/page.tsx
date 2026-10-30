import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getPublishedEditions } from '@/lib/data-editions';
import { Flipbook } from '@/components/flipbook/flipbook';
import { formatMonthEs, issueLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ReadIndexPage() {
  const editions = await getPublishedEditions();
  const edition = editions[0];

  if (!edition) {
    return (
      <div className="public-page mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="masthead text-3xl font-bold">No issues published yet</h1>
        <p className="text-ink/70 mt-3">
          Come back soon: the newspaper team is working on the first edition.
        </p>
      </div>
    );
  }

  const issue = issueLabel(edition.number);

  return (
    <div className="public-page relative mx-auto max-w-6xl px-4 py-8">
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-ink/15 pb-5">
        <div>
          <Link href="/archive" className="inline-flex items-center gap-1 text-sm font-semibold text-ink/60 hover:text-ink">
            <ArrowLeft size={14} /> Archive
          </Link>
          <h1 className="masthead mt-2 text-3xl font-bold md:text-4xl">{edition.title}</h1>
          <p className="text-sm text-ink/60">
            {issue && `${issue} · `}
            {formatMonthEs(edition.edition_date)} · School year {edition.school_year}
          </p>
        </div>
      </div>

      <Flipbook key={edition.id} pdfUrl={edition.pdf_url} title={edition.title} editionId={edition.id} />

      <p className="text-center text-xs text-ink/50 mt-4">
        Use the keyboard arrows, drag the page corner, or tap the buttons to flip through the pages.
      </p>
    </div>
  );
}
