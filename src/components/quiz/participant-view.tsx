'use client';

import { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot, FirestoreError, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, GripVertical, ArrowUp, ArrowDown, Zap } from 'lucide-react';
import type { Quiz, Participant, Answer, UserProfile, AppSettings, LeaderboardEntry } from '@/lib/types';
import { useUser, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';

type ParticipantStatus = 'loading' | 'joining' | 'waiting' | 'question' | 'answered' | 'question-results' | 'results';

const STANDARD_SCORE = 10;

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

  // Fetch the user's monthly ranking to check attendance
  const userRankingDocRef = useMemoFirebase(() => (firestore && user) ? doc(firestore, 'monthly_rankings', user.uid) : null, [firestore, user]);
  const { data: userRanking } = useDoc<LeaderboardEntry>(userRankingDocRef);

  const quizDocRef = useMemoFirebase(() => firestore && quizId ? doc(firestore, "quizzes", quizId) : null, [firestore, quizId]);
  
  const participantDocRef = useMemoFirebase(() => (firestore && quizId && user) ? doc(firestore, `quizzes/${quizId}/participants`, user.uid) : null, [firestore, quizId, user]);
  const { data: myParticipantData, isLoading: isParticipantLoading } = useDoc<Participant>(participantDocRef);

  // A user is eligible for Jolly if they have missed at least one quiz this month
  const isEligibleForJolly = useMemo(() => {
    if (!settings) return false;
    const totalHeld = settings.totalQuizzesHeld || 0;
    const userPlayed = userRanking?.quizzesPlayed || 0;
    return userPlayed < totalHeld;
  }, [settings, userRanking]);

  useEffect(() => {
    if (user && quiz?.state === 'lobby' && !myParticipantData && !isParticipantLoading) {
      
      const joinQuiz = async () => {
        try {
          const userDocRef = doc(firestore, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);

          let userName = user.email?.split('@')[0] || 'Giocatore Misterioso';
          let userAvatar = PlaceHolderImages[0].imageUrl;
          let jollyAvailable = true;

          if (userDocSnap.exists()) {
            const userProfile = userDocSnap.data() as UserProfile;
            userName = userProfile.nickname;
            userAvatar = userProfile.icon;
            jollyAvailable = userProfile.jollyAvailable ?? true;
          }

          const newParticipant: Participant = {
            id: user.uid,
            name: userName,
            avatar: userAvatar,
            score: 0,
            jollyActive: false,
            jollyAvailable: jollyAvailable,
          };
          
          if(participantDocRef) {
            await setDoc(participantDocRef, newParticipant);
          }

        } catch (e) {
          console.error("Error joining quiz:", e);
          setError("Impossibile partecipare al quiz. Riprova.");
        }
      };
      
      joinQuiz();
    }
  }, [user, quiz?.state, myParticipantData, isParticipantLoading, firestore, quizId, participantDocRef]);

  useEffect(() => {
    if (!quizDocRef) return;

    const unsubscribe = onSnapshot(quizDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const quizData = docSnap.data() as Quiz;
            const prevQuizState = quiz?.state;
            setQuiz(quizData);

            if (myParticipantData) {
                const currentQuestionFromHost = quizData.questions?.[quizData.currentQuestionIndex];
                
                const hasAlreadyAnswered = quizData.answers?.some(
                    a => a.participantId === myParticipantData.id && a.questionId === currentQuestionFromHost?.id
                );

                if (quizData.state === 'live' && currentQuestionFromHost) {
                    if (hasAlreadyAnswered) {
                        setStatus('answered');
                    } else {
                        if (quiz?.currentQuestionIndex !== quizData.currentQuestionIndex || prevQuizState !== 'live') {
                            setAnswer('');
                            setReorderAnswers(currentQuestionFromHost.options ? [...currentQuestionFromHost.options].sort(() => Math.random() - 0.5) : []);
                            setStartTime(Date.now());
                            setStatus('question');
                        }
                    }
                } else if (quizData.state === 'question-results') {
                    setStatus('question-results');
                } else if (quizData.state === 'results') {
                    setStatus('results');
                } else if (quizData.state === 'lobby') {
                    setStatus('waiting');
                }
            } else if (quizData.state === 'lobby') {
                 setStatus('joining');
            }

        } else {
            setError("Quiz non trovato. Controlla il link e riprova.");
        }
    }, (err: FirestoreError) => {
        console.error("Firestore snapshot error on participant view:", err);
        setError("Si è verificato un errore nel caricamento del quiz.");
    });

    return () => unsubscribe();
  }, [quizDocRef, myParticipantData, quiz?.currentQuestionIndex, quiz?.state]);
  
  const handleActivateJolly = async () => {
    if (!user || !participantDocRef || !firestore || !myParticipantData?.jollyAvailable || !isEligibleForJolly) return;
    setIsActivatingJolly(true);
    try {
        const batch = writeBatch(firestore);
        const userDocRef = doc(firestore, 'users', user.uid);
        
        batch.update(userDocRef, { jollyAvailable: false });
        batch.update(participantDocRef, { jollyActive: true, jollyAvailable: false });
        
        await batch.commit();
    } catch (e) {
        console.error("Error activating Jolly:", e);
    } finally {
        setIsActivatingJolly(false);
    }
  };

  const handleSubmit = () => {
    if (!startTime || !quiz || !myParticipantData || !firestore || !quiz.questions) return;

    const currentQuestion = quiz.questions[quiz.currentQuestionIndex];
    if (!currentQuestion) return;
    
    const needsMultipleChoice = currentQuestion.type === 'multiple-choice' || (['image', 'video', 'audio'].includes(currentQuestion.type) && currentQuestion.answerType === 'multiple-choice');
    
    let calculatedScore = 0;
    if (needsMultipleChoice) {
      if (answer === currentQuestion.correctAnswer) {
        calculatedScore = STANDARD_SCORE;
      }
    } else if (currentQuestion.type === 'reorder') {
        const isCorrect = JSON.stringify(reorderAnswers) === JSON.stringify(currentQuestion.correctOrder);
        if (isCorrect) {
            calculatedScore = STANDARD_SCORE;
        }
    }

    const responseTime = (Date.now() - startTime) / 1000;
    
    const answerRef = doc(firestore, `quizzes/${quizId}/questions/${currentQuestion.id}/answers`, myParticipantData.id);

    const answerPayload: Omit<Answer, 'isCheating' | 'cheatingReason'> = {
        participantId: myParticipantData.id,
        questionId: currentQuestion.id,
        responseTime: parseFloat(responseTime.toFixed(3)),
        answerText: currentQuestion.type === 'reorder' ? `Ordine: ${reorderAnswers.join(', ')}` : answer,
        score: calculatedScore,
        ...(currentQuestion.type === 'reorder' && { answerOrder: reorderAnswers }),
    };

    setDocumentNonBlocking(answerRef, answerPayload, { merge: true });
    
    setStatus('answered');
  }

 const handleReorder = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...reorderAnswers];
    if (direction === 'up' && index > 0) {
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    }
    setReorderAnswers(newOrder);
  };
  
  const currentQuestion = quiz?.questions?.[quiz.currentQuestionIndex];
  const finalScore = myParticipantData?.score ?? 0;


  const renderContent = () => {
    if (status === 'loading' || isParticipantLoading && status !== 'joining') {
        return (
             <div className="flex flex-col items-center gap-4 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Caricamento quiz...</p>
            </div>
        );
    }
     if (status === 'joining') {
        return (
             <div className="flex flex-col items-center gap-4 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Unendoti al quiz...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center gap-4 text-center">
                <Alert variant="destructive">
                    <AlertTitle>Errore</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
                 <Button onClick={() => window.location.reload()}>Riprova</Button>
            </div>
        )
    }

    switch (status) {
      case 'waiting':
      case 'answered':
      case 'question-results':
        const waitingMessage = () => {
            if (!quiz) return "Caricamento quiz...";
            if (status === 'answered') return 'Risposta inviata! In attesa della prossima domanda o dei risultati...';
            if (status === 'question-results') return 'Tempo scaduto! In attesa dei risultati...';
            if (quiz.state === 'lobby') return "Sei nella lobby! In attesa che l'host inizi il quiz...";
            return 'In attesa della prossima domanda...';
        };
        const myAnswer = status === 'question-results' && currentQuestion && myParticipantData ? quiz.answers?.find(a => a.participantId === myParticipantData.id && a.questionId === currentQuestion.id) : undefined;
        
        if (status === 'question-results' && currentQuestion) {
             return (
                 <div className="space-y-6">
                    <h2 className="text-2xl font-bold">{currentQuestion.text}</h2>
                    {currentQuestion.correctAnswer && (
                        <Alert variant={myAnswer?.answerText === currentQuestion.correctAnswer ? 'default' : 'destructive'} className={myAnswer?.answerText === currentQuestion.correctAnswer ? "bg-green-100 border-green-300 text-green-800" : ""}>
                            <AlertTitle>La risposta corretta è: {currentQuestion.correctAnswer}</AlertTitle>
                        </Alert>
                    )}
                     {currentQuestion.type === 'reorder' && currentQuestion.correctOrder && (
                        <Alert>
                            <AlertTitle>L'ordine corretto è: {currentQuestion.correctOrder.join(", ")}</AlertTitle>
                        </Alert>
                    )}
                    
                    <h3 className="text-lg font-semibold">Risposte degli altri:</h3>
                    <div className="space-y-2">
                        {quiz.participants && quiz.answers && quiz.participants.map(p => {
                            const pAnswer = quiz.answers?.find(a => a.participantId === p.id && a.questionId === currentQuestion.id);
                            return (
                                <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <img src={p.avatar} alt={p.name} className="w-8 h-8 rounded-full" />
                                        <div>
                                            <p className="font-medium">{p.name}</p>
                                            <p className="text-sm text-muted-foreground">{pAnswer ? (pAnswer.answerOrder ? pAnswer.answerOrder.join(', ') : pAnswer.answerText) : 'Nessuna risposta'}</p>
                                        </div>
                                    </div>
                                    {pAnswer && <span className="text-sm font-mono">{pAnswer.responseTime.toFixed(3)}s</span>}
                                </div>
                            )
                        })}
                    </div>
                     <div className="flex flex-col items-center gap-4 text-center pt-4">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <p className="text-muted-foreground">In attesa della prossima domanda...</p>
                    </div>
                </div>
            );
        }

        return (
          <div className="flex flex-col items-center gap-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{waitingMessage()}</p>
             {myParticipantData && (
                <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-3 rounded-full bg-muted p-2">
                        <Image src={myParticipantData.avatar} alt={myParticipantData.name} width={32} height={32} className="w-8 h-8 rounded-full" />
                        <span className="font-medium text-sm">{myParticipantData.name}</span>
                        {myParticipantData.jollyActive && <Zap className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                    </div>
                    
                    {quiz?.state === 'lobby' && myParticipantData.jollyAvailable && settings?.jollyEnabled && isEligibleForJolly && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="secondary" className="gap-2" disabled={isActivatingJolly}>
                                    <Zap className="h-4 w-4" /> Gioca Jolly
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Sei sicuro di voler giocare il Jolly?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Il Jolly raddoppierà il tuo punteggio finale per questo quiz. È disponibile solo per i partecipanti che soddisfano i criteri di idoneità per questa sessione. Ne hai solo uno a disposizione per l'intero mese!
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleActivateJolly}>Conferma e Attiva</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}

                    {quiz?.state === 'lobby' && myParticipantData.jollyAvailable && settings?.jollyEnabled && !isEligibleForJolly && (
                        <div className="text-xs text-muted-foreground mt-2 max-w-xs italic">
                            Il Jolly è disponibile solo per i partecipanti idonei in base allo storico di partecipazione del mese.
                        </div>
                    )}
                    
                    {myParticipantData.jollyActive && quiz?.state === 'lobby' && (
                         <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50 gap-1 p-2">
                            <Zap className="h-3 w-3 fill-yellow-600" /> Jolly Attivato! Punteggio raddoppiato per questa serata.
                        </Badge>
                    )}
                </div>
            )}
          </div>
        );
      case 'question':
        if (!currentQuestion) return (
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Caricamento domanda...</p>
            </div>
        );
        const needsMultipleChoice = currentQuestion.type === 'multiple-choice' || (['image', 'video', 'audio'].includes(currentQuestion.type) && currentQuestion.answerType === 'multiple-choice');
        const needsOpenEnded = currentQuestion.type === 'open-ended' || (['image', 'video', 'audio'].includes(currentQuestion.type) && currentQuestion.answerType === 'open-ended');

        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">{currentQuestion.text}</h2>
                {myParticipantData?.jollyActive && <Zap className="h-6 w-6 text-yellow-500 fill-yellow-500 animate-pulse" title="Jolly Attivo" />}
            </div>

            {currentQuestion.mediaUrl && ['image', 'video', 'audio'].includes(currentQuestion.type) && (
                <div className="w-full max-w-md mx-auto aspect-video relative bg-muted rounded-lg">
                    {currentQuestion.type === 'image' && <img src={currentQuestion.mediaUrl} alt="Contenuto della domanda" className="rounded-lg object-contain w-full h-full" />}
                    {currentQuestion.type === 'video' && <video src={currentQuestion.mediaUrl} controls className="rounded-lg object-contain w-full h-full" />}
                    {currentQuestion.type === 'audio' && <audio src={currentQuestion.mediaUrl} controls className="w-full p-4" />}
                </div>
            )}

            {needsMultipleChoice && currentQuestion.options && (
                <RadioGroup value={answer} onValueChange={setAnswer} className="space-y-2">
                    {currentQuestion.options.map((opt, i) => (
                        <div key={i} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted border border-transparent hover:border-border cursor-pointer">
                            <RadioGroupItem value={opt} id={`opt-${i}`} />
                            <Label htmlFor={`opt-${i}`} className="text-lg cursor-pointer flex-1">{opt}</Label>
                        </div>
                    ))}
                </RadioGroup>
            )}
            {needsOpenEnded && (
                <Textarea 
                    placeholder="La tua risposta..." 
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={4}
                />
            )}
             {currentQuestion.type === 'reorder' && (
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Usa i pulsanti per riordinare gli elementi.</p>
                    {reorderAnswers.map((item, index) => (
                        <div key={item} className="flex items-center gap-2 p-3 border rounded-md bg-background justify-between">
                           <span className="flex items-center gap-2">
                             <GripVertical className="h-5 w-5 text-muted-foreground"/>
                             {item}
                           </span>
                           <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleReorder(index, 'up')} disabled={index === 0}>
                                    <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleReorder(index, 'down')} disabled={index === reorderAnswers.length - 1}>
                                    <ArrowDown className="h-4 w-4" />
                                </Button>
                           </div>
                        </div>
                    ))}
                </div>
            )}
            <Button onClick={handleSubmit} className="w-full" size="lg" disabled={currentQuestion.type === 'reorder' ? false : !answer}>Invia Risposta</Button>
          </div>
        );
        case 'results':
            return (
                <div className="flex flex-col items-center gap-4 text-center">
                    <h2 className="text-2xl font-bold">Quiz Terminato!</h2>
                    <p className="text-muted-foreground">Grazie per aver partecipato. I risultati sono stati mostrati dall'host.</p>
                    {myParticipantData && (
                        <div className="flex flex-col items-center gap-2">
                            <p className="text-lg font-semibold">Il tuo punteggio finale: {finalScore} punti</p>
                            {myParticipantData.jollyActive && <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">Bonus Jolly Applicato!</Badge>}
                        </div>
                    )}
                     <Button onClick={() => {
                        window.location.href = '/';
                     }}>Torna alla Home</Button>
                </div>
            );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="font-headline text-3xl">{quiz?.name || 'Benvenuto al Quiz!'}</CardTitle>
          {quizId && <CardDescription>ID Quiz: {quizId}</CardDescription>}
        </CardHeader>
        <CardContent>
            {renderContent()}
        </CardContent>
      </Card>
    </div>
  );
}
