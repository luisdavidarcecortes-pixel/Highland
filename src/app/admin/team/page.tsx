import { redirect } from 'next/navigation';
import { getTeam } from '@/lib/data-team';
import { pageSession } from '@/lib/page-session';
import { isDemoMode } from '@/lib/demo';
import { TeamManager } from './team-manager';

export const dynamic = 'force-dynamic';

export default async function AdminTeamPage() {
  const demo = isDemoMode();
  const user = demo ? null : await pageSession();
  if (!demo && !user) redirect('/admin/login');

  const team = demo || user?.role === 'admin' ? await getTeam() : null;

  if (!team) {
    return (
      <p className="text-sm text-ink/60 bg-white border border-ink/10 rounded-xl p-5">
        Only administrators can manage the team.
      </p>
    );
  }

  return <TeamManager team={team} demo={demo} currentUserId={user?.id ?? null} verified={user?.aal === 'aal2'} />;
}
