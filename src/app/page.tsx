'use client';

import { useUser } from '@/firebase';
import HostDashboard from "@/components/quiz/host-dashboard";
import { useRouter } from 'next/navigation';
import { Loader2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHost } from '@/hooks/use-host';


export default function Home() {
  const { user, isUserLoading } = useUser();
  const { isHost, isHostLoading } = useHost(user?.uid);
  const router = useRouter();

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
        <div className="flex gap-4">
          <Button onClick={() => router.push('/leaderboard')}>
            <Trophy className="mr-2"/>
            Vai alla Classifica
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
