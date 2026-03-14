'use client';

import { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot, getDoc, setDoc, collection, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Zap, Info, Tags } from 'lucide-react';
import type { Quiz, Participant, Answer, UserProfile, AppSettings, LeaderboardEntry } from '@/lib/types';
import { useUser, useFirestore, useMemoFirebase, useDoc, useCollection } from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';

export default function ParticipantView({ quizId }: { quizId: string }) {
  const [status, setStatus] = useState<'loading' | 'waiting' | 'question' | 'answered' | 'results'>('loading');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answer, setAnswer] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);

  const { user } = useUser();
  const firestore = useFirestore();

  const settingsDocRef = useMemoFirebase(() => doc(firestore, 'settings', 'main'), [firestore]);
  const { data: settings } = useDoc<AppSettings>(settingsDocRef);
  const participantDocRef = useMemoFirebase(() => (firestore && quizId && user) ? doc(firestore, `quizzes/${quizId}/participants`, user.uid) : null, [firestore, quizId, user]);
  const { data: myData } = useDoc<Participant>(participantDocRef);

  useEffect(() => {
    if (user && quizId && !myData && firestore) {
      const join = async () => {
        const profile = await getDoc(doc(firestore, 'users', user.uid));
        const data = profile.data() as UserProfile;
        await setDoc(doc(firestore, `quizzes/${quizId}/participants`, user.uid), {
            id: user.uid,
            name: data?.nickname || user.email?.split('@')[0],
            avatar: data?.icon || PlaceHolderImages[0].imageUrl,
            score: 0,
            jollyAvailable: data?.jollyAvailable ?? true
        });
      };
      join();
    }
  }, [user, quizId, myData, firestore]);

  useEffect(() => {
    if (!quizId || !firestore) return;
    const unsub = onSnapshot(doc(firestore, "quizzes", quizId), (snap) => {
        if (snap.exists()) {
            const q = snap.data() as Quiz;
            setQuiz(q);
            if (q.state === 'live') {
                setStatus('question');
                setStartTime(Date.now());
            } else if (q.state === 'results') {
                setStatus('results');
            } else if (q.state === 'lobby' || q.state === 'creating') {
                setStatus('waiting');
            }
        }
    });
    return () => unsub();
  }, [quizId, firestore]);

  const handleSubmit = () => {
    if (!startTime || !quiz || !myData || !user) return;
    const responseTime = (Date.now() - startTime) / 1000;
    const ansRef = doc(firestore, `quizzes/${quizId}/questions/${quiz.questions[quiz.currentQuestionIndex].id}/answers`, user.uid);
    setDocumentNonBlocking(ansRef, {
        participantId: user.uid,
        questionId: quiz.questions[quiz.currentQuestionIndex].id,
        answerText: answer,
        responseTime: parseFloat(responseTime.toFixed(3)),
        score: 0 
    }, { merge: true });
    setStatus('answered');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl text-center">
        <CardHeader><CardTitle>{quiz?.name || "Quiz"}</CardTitle></CardHeader>
        <CardContent>
            {status === 'loading' && <Loader2 className="animate-spin mx-auto" />}
            {status === 'waiting' && <p>In attesa dell'host...</p>}
            {status === 'answered' && <p>Risposta inviata! In attesa dei risultati...</p>}
            {status === 'question' && (
                <div className="space-y-4">
                    <p className="text-xl font-bold">{quiz?.questions[quiz.currentQuestionIndex].text}</p>
                    {quiz?.questions[quiz.currentQuestionIndex].type === 'multiple-choice' ? (
                        <RadioGroup value={answer} onValueChange={setAnswer} className="text-left space-y-2">
                            {quiz.questions[quiz.currentQuestionIndex].options?.map((o, i) => (
                                <div key={i} className="flex items-center gap-2 p-2 border rounded hover:bg-muted cursor-pointer">
                                  <RadioGroupItem value={o} id={`o-${i}`} />
                                  <Label htmlFor={`o-${i}`} className="flex-1 cursor-pointer">{o}</Label>
                                </div>
                            ))}
                        </RadioGroup>
                    ) : (
                        <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Scrivi qui la tua risposta..." />
                    )}
                    <Button onClick={handleSubmit} className="w-full" size="lg" disabled={!answer}>Invia Risposta</Button>
                </div>
            )}
            {status === 'results' && <p className="text-2xl font-bold">Quiz terminato! Il tuo punteggio finale: {myData?.score} pti</p>}
        </CardContent>
      </Card>
    </div>
  );
}
