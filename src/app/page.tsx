'use client';

import { useUser, useAuth, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import HostDashboard from "@/components/quiz/host-dashboard";
import { useRouter } from 'next/navigation';
import { Loader2, Trophy, LogOut, BookText, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHost } from '@/hooks/use-host';
import Link from 'next/link';
import { doc } from 'firebase/firestore';
import type { AppSettings } from '@/lib/types';

export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const { isHost, isHostLoading } = useHost(user?.uid);
  const router = useRouter();

  const settingsDocRef = useMemoFirebase(() => doc(firestore, 'settings', 'main'), [firestore]);
  const { data: settings, isLoading: isSettingsLoading } = useDoc<AppSettings>(settingsDocRef);

  if (isUserLoading || isHostLoading || isSettingsLoading) {
    return <div className="flex h-screen w-full items-center justify-center bg-background"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  if (!user) {
    return (
     <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-center">
       <h1 className="text-2xl font-bold">Benvenuto a MaestroDiQuiz!</h1>
       <div className="flex gap-4"><Button onClick={() => router.push('/login')}>Accedi</Button><Button variant="outline" onClick={() => router.push('/register')}>Registrati</Button></div>
     </div>
   );
  }

  if (!isHost) {
     return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-center px-4">
        <h1 className="text-2xl font-bold">Accesso Partecipante</h1>
        <div className="flex flex-wrap justify-center gap-4 max-w-md">
          <Button onClick={() => router.push('/leaderboard')} disabled={!settings?.leaderboardEnabled}><Trophy className="mr-2"/>Classifica</Button>
          <Button variant="secondary" asChild><Link href="/rules"><BookText className="mr-2"/>Regolamento</Link></Button>
          <Button variant="outline" asChild><Link href="/profile"><UserCircle className="mr-2"/>Profilo</Link></Button>
          <Button variant="outline" onClick={() => auth.signOut()}><LogOut className="mr-2"/>Esci</Button>
        </div>
      </div>
    );
  }
  
  return <main><HostDashboard isReadOnly={false} /></main>;
}
