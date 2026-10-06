import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getArticleBySlug, getPublishedArticles } from '@/lib/data-articles';
import { toYouTubeEmbed, isAudioUrl, formatDateEs } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await getArticleBySlug(params.slug);
  if (!article) return { title: 'Article not found' };
  return {
    title: article.title,
    description: article.excerpt ?? undefined,
    openGraph: { images: article.image_url ? [article.image_url] : undefined },
  };
}

export default async function ArticlePage({ params }: Props) {
  const article = await getArticleBySlug(params.slug);
  if (!article) notFound();

  const others = (await getPublishedArticles()).filter((a) => a.slug !== article.slug).slice(0, 3);
  const embed = article.video_url ? toYouTubeEmbed(article.video_url) : null;
  const audio = article.audio_url && isAudioUrl(article.audio_url) ? article.audio_url : null;

  return (
    <article className="public-page mx-auto max-w-3xl px-4 py-10">
      <Link href="/news" className="text-sm text-ink/60 hover:text-ink">
        ← All news
      </Link>

      <h1 className="masthead text-3xl md:text-4xl font-bold mt-3">{article.title}</h1>
      <p className="text-sm text-ink/60 mt-2">
        {formatDateEs(article.created_at)}
      </p>

      {article.image_url && (
        <div className="relative aspect-video mt-6 rounded-xl overflow-hidden shadow-card">
          <Image src={article.image_url} alt={article.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 768px" priority />
        </div>
      )}

      <div className="prose prose-gray max-w-none mt-6 whitespace-pre-line leading-relaxed">
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
