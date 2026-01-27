'use client';

import { useUser, useAuth, useFirestore } from '@/firebase';
import HostDashboard from "@/components/quiz/host-dashboard";
import { useRouter } from 'next/navigation';
import { Loader2, Trophy, LogOut, BookText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHost } from '@/hooks/use-host';
import { useEffect } from 'react';
import Link from 'next/link';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ADMIN_ROLES } from '@/lib/roles';


export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const { isHost, isHostLoading } = useHost(user?.uid);
  const router = useRouter();

  // This effect ensures a host document exists for admin users.
  // It's the "bootstrapping" mechanism for the host role.
  useEffect(() => {
    if (user && user.email && ADMIN_ROLES.includes(user.email)) {
      const hostDocRef = doc(firestore, 'hosts', user.uid);
      const checkAndCreateHost = async () => {
        const docSnap = await getDoc(hostDocRef);
        if (!docSnap.exists()) {
          try {
            // Create the host document. `useHost` will pick this up.
            await setDoc(hostDocRef, {
              username: user.email,
              id: user.uid,
            });
            console.log(`Host document created for ${user.email}`);
          } catch (error) {
            console.error("Error creating host document:", error);
          }
        }
      };
      checkAndCreateHost();
    }
  }, [user, firestore]);

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

  // If the user is logged in, but not a host, show the participant view.
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
  
  // If the user is a host, they have full permissions.
  // The isReadOnly concept is simplified: you are either a host or not.
  return (
    <main>
      <HostDashboard isReadOnly={false} />
    </main>
  );
}
