'use client';

import ParticipantView from '@/components/quiz/participant-view';
import { useUser, useAuth } from '@/firebase';
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
    // If not loading and not logged in, redirect to login
    if (!isUserLoading && !user) {
      localStorage.setItem('redirectAfterLogin', `/join/${quizId}`);
      router.push('/login');
    }
  }, [user, isUserLoading, router, quizId]);

  // Show a loader while user and host status are being determined
  if (isUserLoading || isHostLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <span className="sr-only">Caricamento...</span>
      </div>
    );
  }

  // If the user is a host, they can observe the quiz
  if (user && isHost) {
     return (
       <main>
          <HostDashboard isReadOnly={true} />
       </main>
    );
  }
  
  // If the user is not logged in, they are being redirected, so show a loader.
  if (!user) {
     return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <span className="sr-only">Reindirizzamento al login...</span>
      </div>
    );
  }

  // Only if the user is a valid participant (logged in and not a host), show the participant view.
  return (
    <main>
      <ParticipantView quizId={quizId} />
    </main>
  );
}
