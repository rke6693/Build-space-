import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { hasProEntitlement, freeRunsRemainingToday } from '@/lib/entitlement';
import PlayClient from './PlayClient';

export default async function Play() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?next=/play');
  const userId = session.user.id;
  const [isPro, remaining] = await Promise.all([
    hasProEntitlement(userId),
    freeRunsRemainingToday(userId),
  ]);
  return <PlayClient isPro={isPro} runsRemaining={remaining} />;
}
