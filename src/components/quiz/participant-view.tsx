
'use client';

import { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot, FirestoreError, getDoc, setDoc, collection, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Zap, Tags, ArrowUp, ArrowDown } from 'lucide-react';
import type { Quiz, Participant, Answer, UserProfile, AppSettings, LeaderboardEntry } from '@/lib/types';
import { useUser, useFirestore, useMemoFirebase, useDoc, useCollection } from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';

type ParticipantStatus = 'loading' | 'joining' | 'waiting' | 'question' | 'answered' | 'question-results' | 'results';

export default function ParticipantView({ quizId }: { quizId: string }) {
  const [status, setStatus] = useState<ParticipantStatus>('loading');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answer, setAnswer] = useState('');
  const [reorderAnswers, setReorderAnswers] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [isActivatingJolly, setIsActivatingJolly] = useState(false);

  const { user } = useUser();
  const firestore = useFirestore();

  const settingsDocRef = useMemoFirebase(() => doc(firestore, 'settings', 'main'), [firestore]);
  const { data: settings } = useDoc<AppSettings>(settingsDocRef);

  const participantsColRef = useMemoFirebase(() => quizId ? collection(firestore, `quizzes/${quizId}/participants`) : null, [firestore, quizId]);
  const { data: allParticipants } = useCollection<Participant>(participantsColRef);

  const userRankingDocRef = useMemoFirebase(() => (firestore && user) ? doc(firestore, 'monthly_rankings', user.uid) : null, [firestore, user]);
  const { data: userRanking } = useDoc<LeaderboardEntry>(userRankingDocRef);

  const quizDocRef = useMemoFirebase(() => firestore && quizId ? doc(firestore, "quizzes", quizId) : null, [firestore, quizId]);
  const participantDocRef = useMemoFirebase(() => (firestore && quizId && user) ? doc(firestore, `quizzes/${quizId}/participants`, user.uid) : null, [firestore, quizId, user]);
  const { data: myParticipantData, isLoading: isParticipantLoading } = useDoc<Participant>(participantDocRef);

  const currentQuestion = quiz?.questions?.[quiz.currentQuestionIndex];
  const answersColRef = useMemoFirebase(() => (quizId && currentQuestion) ? collection(firestore, `quizzes/${quizId}/questions/${currentQuestion.id}/answers`) : null, [firestore, quizId, currentQuestion?.id]);
  const { data: currentQuestionAnswers } = useCollection<Answer>(answersColRef);

  const isEligibleForJolly = useMemo(() => {
    if (!settings) return false;
    const totalHeld = settings.totalQuizzesHeld || 0;
    const userPlayed = userRanking?.quizzesPlayed || 0;
    return userPlayed < totalHeld;
  }, [settings, userRanking]);

  useEffect(() => {
    if (user && quiz?.state === 'lobby' && !myParticipantData && !isParticipantLoading) {
      const join = async () => {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        const profile = snap.data() as UserProfile;
        const newP: Participant = {
          id: user.uid,
          name: profile?.nickname || user.email?.split('@')[0] || "Player",
          avatar: profile?.icon || PlaceHolderImages[0].imageUrl,
          score: 0,
          jollyActive: false,
          jollyAvailable: profile?.jollyAvailable ?? true,
        };
        if(participantDocRef) await setDoc(participantDocRef, newP);
      };
      join();
    }
  }, [user, quiz?.state, myParticipantData, isParticipantLoading, firestore, participantDocRef]);

  useEffect(() => {
    if (!quizDocRef) return;
    const unsub = onSnapshot(quizDocRef, (snap) => {
        if (!snap.exists()) return setError("Quiz non trovato.");
        const data = snap.data() as Quiz;
        const prev = quiz?.state;
        setQuiz(data);
        if (myParticipantData) {
            if (data.state === 'live') {
                if (status !== 'answered' || quiz?.currentQuestionIndex !== data.currentQuestionIndex) {
                    setAnswer('');
                    setReorderAnswers(data.questions[data.currentQuestionIndex].options ? [...data.questions[data.currentQuestionIndex].options].sort(() => Math.random() - 0.5) : []);
                    setStartTime(Date.now());
                    setStatus('question');
                }
            } else if (data.state === 'question-results') setStatus('question-results');
            else if (data.state === 'results') setStatus('results');
            else setStatus('waiting');
        } else if (data.state === 'lobby') setStatus('joining');
    });
    return () => unsub();
  }, [quizDocRef, myParticipantData, status, quiz?.currentQuestionIndex]);

  const handleSubmit = () => {
    if (!startTime || !currentQuestion || !myParticipantData) return;
    const responseTime = (Date.now() - startTime) / 1000;
    const ref = doc(firestore, `quizzes/${quizId}/questions/${currentQuestion.id}/answers`, myParticipantData.id);
    const payload: Partial<Answer> = {
        participantId: myParticipantData.id,
        questionId: currentQuestion.id,
        responseTime: parseFloat(responseTime.toFixed(3)),
        answerText: currentQuestion.type === 'reorder' ? `Ordine: ${reorderAnswers.join(', ')}` : answer,
        score: 0, // L'host assegna i punti manualmente
        ...(currentQuestion.type === 'reorder' && { answerOrder: reorderAnswers }),
    };
    setDocumentNonBlocking(ref, payload, { merge: true });
    setStatus('answered');
  };

  const handleActivateJolly = async () => {
    if (!user || !participantDocRef || isActivatingJolly) return;
    setIsActivatingJolly(true);
    const batch = writeBatch(firestore);
    batch.update(doc(firestore, 'users', user.uid), { jollyAvailable: false });
    batch.update(participantDocRef, { jollyActive: true, jollyAvailable: false });
    await batch.commit();
    setIsActivatingJolly(false);
  };

  const handleReorder = (idx: number, dir: 'up'|'down') => {
    const next = [...reorderAnswers];
    if (dir === 'up' && idx > 0) [next[idx], next[idx-1]] = [next[idx-1], next[idx]];
    else if (dir === 'down' && idx < next.length-1) [next[idx], next[idx+1]] = [next[idx+1], next[idx]];
    setReorderAnswers(next);
  };

  if (status === 'loading' || error) return <div className="flex flex-col items-center justify-center min-h-screen text-center p-4"><p>{error || "Caricamento..."}</p></div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
            <CardTitle className="text-3xl font-headline">{quiz?.name}</CardTitle>
            <div className="flex justify-center gap-2 mt-2">
                <Badge variant="secondary">{status.replace('-',' ').toUpperCase()}</Badge>
                {myParticipantData?.jollyActive && <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><Zap className="h-3 w-3 mr-1 fill-yellow-800"/> JOLLY ATTIVO</Badge>}
            </div>
        </CardHeader>
        <CardContent>
            {status === 'waiting' || status === 'answered' ? (
                <div className="text-center space-y-6">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary"/>
                    <p className="text-muted-foreground">{status === 'answered' ? "Risposta inviata! In attesa dell'host..." : "In attesa dell'inizio..."}</p>
                    {quiz?.state === 'lobby' && settings?.jollyEnabled && myParticipantData?.jollyAvailable && isEligibleForJolly && (
                        <Button variant="secondary" onClick={handleActivateJolly} disabled={isActivatingJolly}>Gioca Jolly (Raddoppia Punteggio Finale)</Button>
                    )}
                </div>
            ) : status === 'question' && currentQuestion ? (
                <div className="space-y-6">
                    <h2 className="text-2xl font-bold">{currentQuestion.text}</h2>
                    {currentQuestion.mediaUrl && (
                        <div className="max-w-md mx-auto aspect-video rounded-lg overflow-hidden bg-muted">
                            {currentQuestion.type === 'image' && <img src={currentQuestion.mediaUrl} className="w-full h-full object-contain"/>}
                            {currentQuestion.type === 'video' && <video src={currentQuestion.mediaUrl} controls className="w-full h-full"/>}
                            {currentQuestion.type === 'audio' && <audio src={currentQuestion.mediaUrl} controls className="w-full p-4"/>}
                        </div>
                    )}
                    {currentQuestion.type === 'reorder' ? (
                        <div className="space-y-2">
                            {reorderAnswers.map((item, i) => (
                                <div key={item} className="flex items-center justify-between p-3 border rounded-lg bg-card shadow-sm">
                                    <span>{item}</span>
                                    <div className="flex gap-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleReorder(i, 'up')} disabled={i===0}><ArrowUp className="h-4 w-4"/></Button><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleReorder(i, 'down')} disabled={i===reorderAnswers.length-1}><ArrowDown className="h-4 w-4"/></Button></div>
                                </div>
                            ))}
                        </div>
                    ) : currentQuestion.type === 'multiple-choice' || currentQuestion.answerType === 'multiple-choice' ? (
                        <RadioGroup value={answer} onValueChange={setAnswer} className="space-y-2">
                            {currentQuestion.options?.map(o => <div key={o} className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-muted cursor-pointer"><RadioGroupItem value={o} id={o}/><Label htmlFor={o} className="flex-1 cursor-pointer">{o}</Label></div>)}
                        </RadioGroup>
                    ) : (
                        <Textarea placeholder="Scrivi la tua risposta..." value={answer} onChange={e => setAnswer(e.target.value)} rows={4}/>
                    )}
                    <Button className="w-full" size="lg" onClick={handleSubmit} disabled={!answer && currentQuestion.type !== 'reorder'}>Invia</Button>
                </div>
            ) : status === 'question-results' ? (
                <div className="space-y-4 text-center">
                    <h3 className="text-xl font-bold">Tempo Scaduto!</h3>
                    {currentQuestion?.correctAnswer && <div className="p-4 bg-green-50 border border-green-200 rounded-lg"><p className="text-sm text-green-800 uppercase font-bold">Risposta Corretta</p><p className="text-2xl font-bold text-green-900">{currentQuestion.correctAnswer}</p></div>}
                    <p className="text-muted-foreground italic">In attesa dell'host per la prossima domanda...</p>
                </div>
            ) : status === 'results' ? (
                <div className="text-center space-y-4">
                    <h2 className="text-3xl font-bold">Fine!</h2>
                    <p className="text-xl">Punteggio: <span className="font-bold">{myParticipantData?.score}</span> pti</p>
                    <Button onClick={() => window.location.href='/'}>Torna alla Home</Button>
                </div>
            ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
