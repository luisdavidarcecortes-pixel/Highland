import { getAllEditions } from '@/lib/data-editions';
import { isDemoMode } from '@/lib/demo';
import { EditionsManager } from './editions-manager';

export const dynamic = 'force-dynamic';

export default async function AdminEditionsPage() {
  const editions = await getAllEditions();
  return <EditionsManager initialEditions={editions} demo={isDemoMode()} />;
}
