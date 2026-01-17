'use client';

import ParticipantView from '@/components/quiz/participant-view';
import { useUser, useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect, use } from 'react';
import { Loader2, LogOut, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHost } from '@/hooks/use-host';


export default function JoinQuizPage({ params }: { params: { quizId: string } }) {
  const { quizId } = use(params);
  const { user, isUserLoading } = useUser();
  const { isHost, isHostLoading } = useHost(user?.uid);
  const auth = useAuth();
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

  // If the user is a host, show a dedicated screen to prevent them from joining as a participant
  if (user && isHost) {
     return (
       <div className="flex h-screen w-full items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
            <CardHeader>
                <CardTitle>Sei un Host!</CardTitle>
                <CardDescription>
                    Hai aperto un link di invito mentre eri connesso come host.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Per partecipare al quiz, devi prima disconnetterti e accedere come partecipante.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="outline" className="w-full" onClick={() => auth.signOut()}>
                        <LogOut /> Esci
                    </Button>
                    <Button className="w-full" onClick={() => router.push('/')}>
                       <LayoutGrid /> Vai alla Dashboard
                    </Button>
                </div>
            </CardContent>
        </Card>
       </div>
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
