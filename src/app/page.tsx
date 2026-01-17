'use client';

import { useUser, useAuth } from '@/firebase';
import HostDashboard from "@/components/quiz/host-dashboard";
import { useRouter } from 'next/navigation';
import { Loader2, Trophy, LogOut, BookText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHost } from '@/hooks/use-host';
import { useEffect } from 'react';
import Link from 'next/link';


export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const { isHost, isHostLoading } = useHost(user?.uid);
  const router = useRouter();

  useEffect(() => {
    const logoutFlag = 'force_logout_20240726_v6'; // Chiave unica per questa operazione una tantum
    if (typeof window !== 'undefined') {
      if (!sessionStorage.getItem(logoutFlag)) {
        console.log("Forzo un logout una tantum e pulisco lo stato locale per risolvere potenziali problemi di sessione.");
        localStorage.removeItem('active-quiz-id');
        localStorage.removeItem('quiz-draft');
        auth.signOut();
        sessionStorage.setItem(logoutFlag, 'true');
      }
    }
  }, [auth]);

  if (isUserLoading || isHostLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!user) {
    return (
     <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-center">
       <h1 className="text-2xl font-bold">Benvenuto a MaestroDiQuiz!</h1>
       <p className="text-muted-foreground">Accedi per iniziare o registrati per partecipare.</p>
       <div className="flex gap-4">
         <Button onClick={() => router.push('/login')}>Accedi</Button>
         <Button variant="outline" onClick={() => router.push('/register')}>Registrati</Button>
       </div>
     </div>
   );
  }

  if (!isHost) {
     return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-center">
        <h1 className="text-2xl font-bold">Accesso Partecipante</h1>
        <p className="text-muted-foreground">Sei loggato come partecipante. Usa un link d'invito per unirti a un quiz o controlla la classifica.</p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button onClick={() => router.push('/leaderboard')}>
            <Trophy className="mr-2"/>
            Vai alla Classifica
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/rules">
              <BookText className="mr-2"/>
              Regolamento
            </Link>
          </Button>
          <Button variant="outline" onClick={() => auth.signOut()}>
            <LogOut className="mr-2"/>
            Esci
          </Button>
        </div>
      </div>
    );
  }
  
  const isReadOnly = user.email !== 'host@quiz.com';

  return (
    <main>
      <HostDashboard isReadOnly={isReadOnly} />
    </main>
  );
}
