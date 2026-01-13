'use client';

import ParticipantView from '@/components/quiz/participant-view';
import { useUser, useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect, use } from 'react';
import { Loader2, LogOut, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';


const ADMIN_ROLES = ['host@quiz.com', 'cohost1@quiz.com', 'cohost2@quiz.com'];

export default function JoinQuizPage({ params }: { params: { quizId: string } }) {
  const { quizId } = use(params);
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Se l'utente non è loggato e il caricamento è terminato, reindirizza
    if (!isUserLoading && !user) {
      localStorage.setItem('redirectAfterLogin', `/join/${quizId}`);
      router.push('/login');
    }
  }, [user, isUserLoading, router, quizId]);

  const isHost = user?.email && ADMIN_ROLES.includes(user.email);

  // Mostra il loader mentre si determina lo stato dell'utente
  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <span className="sr-only">Caricamento...</span>
      </div>
    );
  }

  // Se l'utente è un host, mostra una schermata dedicata per evitare il loop
  if (user && isHost) {
     return (
       <div className="flex h-screen w-full items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
            <CardHeader>
                <CardTitle>Sei l'Host!</CardTitle>
                <CardDescription>
                    Hai aperto un link di invito mentre eri connesso come host.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Per testare come partecipante, devi prima disconnetterti.
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
  
  // Se l'utente non è loggato, mostra comunque il loader durante il reindirizzamento
  if (!user) {
     return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <span className="sr-only">Reindirizzamento al login...</span>
      </div>
    );
  }

  // Solo se l'utente è un partecipante valido, mostra la vista partecipante
  return (
    <main>
      <ParticipantView quizId={quizId} />
    </main>
  );
}
