
'use client';

import { useUser, useAuth, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import HostDashboard from "@/components/quiz/host-dashboard";
import { useRouter } from 'next/navigation';
import { Loader2, Trophy, LogOut, BookText, UserCircle, Play } from 'lucide-react';
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
    return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }
  
  if (!user) {
    return (
     <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
       <h1 className="text-4xl font-headline font-bold">MaestroDiQuiz</h1>
       <p className="text-muted-foreground max-w-sm">Accedi per partecipare ai quiz o gestisci le tue sessioni come host.</p>
       <div className="flex gap-3 w-full max-w-xs">
         <Button className="flex-1" onClick={() => router.push('/login')}>Accedi</Button>
         <Button variant="outline" className="flex-1" onClick={() => router.push('/register')}>Registrati</Button>
       </div>
     </div>
   );
  }

  if (!isHost) {
     const isLeaderboardVisible = settings?.leaderboardEnabled ?? false;
     return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-6 bg-background p-6 text-center">
        <div className="space-y-2">
            <h1 className="text-3xl font-headline font-bold">Bentornato!</h1>
            <p className="text-muted-foreground">Usa un link d'invito per unirti a un quiz in corso.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
          <Button variant="secondary" className="h-14 gap-2" asChild>
            <Link href="/leaderboard"><Trophy className="h-5 w-5"/> Classifica {!isLeaderboardVisible && "(Off)"}</Link>
          </Button>
          <Button variant="secondary" className="h-14 gap-2" asChild>
            <Link href="/profile"><UserCircle className="h-5 w-5"/> Il Mio Profilo</Link>
          </Button>
          <Button variant="outline" className="h-14 gap-2" asChild>
            <Link href="/rules"><BookText className="h-5 w-5"/> Regolamento</Link>
          </Button>
          <Button variant="destructive" className="h-14 gap-2" onClick={() => auth.signOut()}>
            <LogOut className="h-5 w-5"/> Esci
          </Button>
        </div>
      </div>
    );
  }
  
  return <main><HostDashboard isReadOnly={false} /></main>;
}
