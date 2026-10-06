import { redirect } from 'next/navigation';
import { getPublishedEditions } from '@/lib/data-editions';

export const dynamic = 'force-dynamic';

export default async function ReadIndexPage() {
  const editions = await getPublishedEditions();
  if (editions.length > 0) redirect(`/read/${editions[0].id}`);
  return (
    <div className="public-page mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="masthead text-3xl font-bold">No issues published yet</h1>
      <p className="text-ink/70 mt-3">
        Come back soon: the newspaper team is working on the first edition.
      </p>
    </div>
  );
}
