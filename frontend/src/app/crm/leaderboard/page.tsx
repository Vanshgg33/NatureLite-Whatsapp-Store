import { redirect } from 'next/navigation';

export default function LeaderboardRedirect() {
  redirect('/crm/analytics?tab=leaderboard');
}
