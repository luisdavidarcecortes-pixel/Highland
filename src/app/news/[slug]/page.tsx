import Image from 'next/image';
import { Link } from '@/components/page-transitions';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getArticleBySlug, getPublishedArticles } from '@/lib/data-articles';
import { toYouTubeEmbed, isAudioUrl, formatDateEs } from '@/lib/utils';
import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const routeParams = await params;
  const article = await getArticleBySlug(routeParams.slug);
  if (!article || !article.published) {
    return { title: 'Article not found', robots: { index: false, follow: false } };
  }
  const description =
    article.excerpt?.trim() || article.body.replace(/\s+/g, ' ').trim().slice(0, 155);
  const image = article.image_url ? absoluteUrl(article.image_url) : undefined;
  return {
    title: article.title,
    description,
    alternates: { canonical: `/news/${article.slug}` },
    openGraph: {
      type: 'article',
      title: article.title,
      description,
      url: `/news/${article.slug}`,
      publishedTime: article.created_at,
      images: image ? [{ url: image, alt: article.title }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: article.title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const routeParams = await params;
  const article = await getArticleBySlug(routeParams.slug);
  // Drafts are unreachable from the public site even if the database policy
  // ever regresses and returns them: the page itself is the last guard.
  if (!article || !article.published) notFound();

  const others = (await getPublishedArticles()).filter((a) => a.slug !== article.slug).slice(0, 3);
  const embed = article.video_url ? toYouTubeEmbed(article.video_url) : null;
  const audio = article.audio_url && isAudioUrl(article.audio_url) ? article.audio_url : null;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.excerpt ?? undefined,
    datePublished: article.created_at,
    image: article.image_url ? absoluteUrl(article.image_url) : undefined,
    mainEntityOfPage: absoluteUrl(`/news/${article.slug}`),
    publisher: {
      '@type': 'Organization',
      name: 'The Highlander · Highland Academy',
    },
  };

  return (
    <article className="public-page mx-auto max-w-3xl px-4 py-10 md:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <Link href="/news" className="text-sm font-semibold text-ink/60 hover:text-ink">
        ← All news
      </Link>

      <p className="editorial-kicker mt-8">Around campus</p>
      <h1 className="masthead mt-2 text-4xl font-bold leading-tight md:text-5xl">{article.title}</h1>
      <p className="text-sm text-ink/60 mt-2">
        {formatDateEs(article.created_at)}
        <span className="mx-2" aria-hidden>·</span>{Math.max(1, Math.ceil(article.body.split(/\s+/).length / 200))} min read
      </p>

      {article.excerpt && <p className="article-deck mt-5 border-b border-ink/15 pb-6">{article.excerpt}</p>}

      {article.image_url && (
        <div className="relative aspect-video mt-6 rounded-xl overflow-hidden shadow-card">
          <Image src={article.image_url} alt={article.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 768px" priority />
        </div>
      )}

      <div className="prose prose-gray max-w-none mt-8 whitespace-pre-line leading-relaxed">
        {article.body}
      </div>

      {embed && (
        <div className="mt-8">
          <h2 className="masthead text-xl font-bold mb-3">Video</h2>
          <div className="aspect-video rounded-xl overflow-hidden shadow-card">
            <iframe
              src={embed}
              title="Article video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        </div>
      )}

      {audio && (
        <div className="mt-8">
          <h2 className="masthead text-xl font-bold mb-3">Listen to the audio</h2>
          <audio controls src={audio} className="w-full" />
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-12 pt-6 rule-double">
          <h2 className="masthead text-xl font-bold mb-4">You may also like</h2>
          <ul className="space-y-2">
            {others.map((o) => (
              <li key={o.id}>
                <Link href={`/news/${o.slug}`} className="text-brand font-semibold hover:underline">
                  {o.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
