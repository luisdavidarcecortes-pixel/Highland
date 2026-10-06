import Link from 'next/link';
import Image from 'next/image';
import type { Article, Edition } from '@/lib/types';
import { formatDateEs, formatMonthEs, issueLabel } from '@/lib/utils';
import { Reveal } from '@/components/reveal';
import { EditionCover } from '@/components/edition-cover';

export function EditionCard({ edition }: { edition: Edition }) {
  return (
    <Reveal as="div" delay={0} className="h-full">
      <Link
        href={`/read/${edition.id}`}
        data-lg-surface
        className="lg-glass public-card group block h-full rounded-xl border border-ink/10 overflow-hidden transition-shadow"
      >
        <EditionCover
          coverUrl={edition.cover_url}
          pdfUrl={edition.pdf_url}
          alt={`${issueLabel(edition.number) ?? 'Issue'} cover`}
          className="aspect-[3/4] bg-paper relative overflow-hidden"
          sizes="(max-width: 768px) 50vw, 300px"
        />
        <div className="p-4">
          <p className="text-xs uppercase tracking-wider text-accent font-semibold">
            {[issueLabel(edition.number), formatMonthEs(edition.edition_date)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <h3 className="masthead text-lg font-bold leading-snug group-hover:underline">{edition.title}</h3>
          {edition.description && (
            <p className="text-sm text-ink/70 mt-1 line-clamp-2">{edition.description}</p>
          )}
        </div>
      </Link>
    </Reveal>
  );
}

export function ArticleCard({ article }: { article: Article }) {
  return (
    <Reveal as="div" delay={0} className="h-full">
      <article
        data-lg-surface
        className="lg-glass public-card h-full rounded-xl border border-ink/10 overflow-hidden"
      >
        {article.image_url && (
          <div className="aspect-video relative overflow-hidden">
            <Image
              src={article.image_url}
              alt={article.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 400px"
            />
          </div>
        )}
        <div className="p-4">
          <p className="text-xs text-ink/60">{formatDateEs(article.created_at)}</p>
          <h3 className="masthead text-lg font-bold leading-snug mt-0.5">
            <Link href={`/news/${article.slug}`} className="hover:underline">
              {article.title}
            </Link>
          </h3>
          {article.excerpt && (
            <p className="text-sm text-ink/70 mt-1">{article.excerpt}</p>
          )}
          <Link
            href={`/news/${article.slug}`}
            className="inline-block mt-3 text-sm font-semibold text-brand hover:underline"
          >
            Read more →
          </Link>
        </div>
      </article>
    </Reveal>
  );
}
