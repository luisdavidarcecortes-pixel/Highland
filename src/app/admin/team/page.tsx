import { getTeam } from '@/lib/data-team';
import { getSessionUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/demo';
import { TeamManager } from './team-manager';

export const dynamic = 'force-dynamic';

export default async function AdminTeamPage() {
  const demo = isDemoMode();
  const user = demo ? null : await getSessionUser();
  const team = demo ? await getTeam() : user?.role === 'admin' ? await getTeam() : null;

  if (!team) {
    return (
      <p className="text-sm text-ink/60 bg-white border border-ink/10 rounded-xl p-5">
        Only administrators can manage the team.
      </p>
    );
  }

  return <TeamManager team={team} demo={demo} currentUserId={user?.id ?? null} />;
}
