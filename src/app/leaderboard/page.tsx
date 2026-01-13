'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Home, Loader2 } from 'lucide-react';
import type { LeaderboardEntry } from '@/lib/types';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';

export default function LeaderboardPage() {
  const firestore = useFirestore();
  const rankingsColRef = useMemoFirebase(() => collection(firestore, 'monthly_rankings'), [firestore]);
  const { data: leaderboard, isLoading } = useCollection<LeaderboardEntry>(rankingsColRef);

  const sortedLeaderboard = leaderboard ? [...leaderboard].sort((a, b) => b.monthlyScore - a.monthlyScore) : [];

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl text-center">
        <CardHeader>
          <div className="flex flex-col items-center gap-2">
            <Trophy className="h-10 w-10 text-yellow-500" />
            <CardTitle className="font-headline text-3xl">Classifica Mensile</CardTitle>
          </div>
          <CardDescription>
            I migliori punteggi di questo mese. Completa più quiz per scalare la classifica!
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Caricamento classifica...</span>
            </div>
          ) : sortedLeaderboard.length > 0 ? (
            <div className="space-y-2">
              {sortedLeaderboard.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border text-left">
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-lg w-6 text-center">{i + 1}</span>
                    <Avatar>
                      <AvatarImage src={p.avatar} alt={p.name} />
                      <AvatarFallback>{p.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{p.name}</span>
                  </div>
                  <span className="text-lg font-bold font-mono">{p.monthlyScore} pti</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-8">
              La classifica è ancora vuota. Gioca a un quiz per comparire qui!
            </p>
          )}
        </CardContent>
         <CardContent className="flex justify-center">
             <Button asChild variant="outline">
                <Link href="/">
                    <Home className="mr-2 h-4 w-4"/>
                    Torna alla Home
                </Link>
             </Button>
        </CardContent>
      </Card>
    </div>
  );
}
