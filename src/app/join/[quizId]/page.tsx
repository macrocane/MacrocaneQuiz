'use client';

import ParticipantView from '@/components/quiz/participant-view';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect, use } from 'react';
import { Loader2 } from 'lucide-react';
import { useHost } from '@/hooks/use-host';
import HostDashboard from '@/components/quiz/host-dashboard';

export default function JoinQuizPage({ params }: { params: { quizId: string } }) {
  const { quizId } = use(params);
  const { user, isUserLoading } = useUser();
  const { isHost, isHostLoading } = useHost(user?.uid);
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      localStorage.setItem('redirectAfterLogin', `/join/${quizId}`);
      router.push('/login');
    }
  }, [user, isUserLoading, router, quizId]);

  if (isUserLoading || isHostLoading) {
    return <div className="flex h-screen w-full items-center justify-center bg-background"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (user && isHost) {
     return <main><HostDashboard isReadOnly={true} /></main>;
  }
  
  if (!user) return null;

  return <main><ParticipantView quizId={quizId} /></main>;
}
