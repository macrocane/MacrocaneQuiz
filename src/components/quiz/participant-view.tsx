

'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot, FirestoreError, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import type { Quiz, Participant, Answer, UserProfile } from '@/lib/types';
import { useUser, useFirestore, useMemoFirebase, FirestorePermissionError, errorEmitter } from '@/firebase';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';

type ParticipantStatus = 'loading' | 'joining' | 'waiting' | 'question' | 'answered' | 'question-results' | 'results';

export default function ParticipantView({ quizId }: { quizId: string }) {
  const [status, setStatus] = useState<ParticipantStatus>('loading');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [answer, setAnswer] = useState('');
  const [reorderAnswers, setReorderAnswers] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [error, setError] = useState('');

  const { user } = useUser();
  const firestore = useFirestore();

  const quizDocRef = useMemoFirebase(() => firestore && quizId ? doc(firestore, "quizzes", quizId) : null, [firestore, quizId]);

  // Effect to join the quiz once user and quiz data are available
  useEffect(() => {
    if (user && quiz && quiz.state === 'lobby' && !participant && status !== 'joining') {
      setStatus('joining');

      const joinQuiz = async () => {
        try {
          const userDocRef = doc(firestore, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);

          let userName = user.email?.split('@')[0] || 'Giocatore Misterioso';
          let userAvatar = PlaceHolderImages[Math.floor(Math.random() * PlaceHolderImages.length)].imageUrl;

          if (userDocSnap.exists()) {
            const userProfile = userDocSnap.data() as UserProfile;
            userName = userProfile.nickname;
            userAvatar = userProfile.icon;
          } else {
            console.warn(`User profile for ${user.uid} not found. Using default values.`);
          }

          const newParticipant: Participant = {
            id: user.uid,
            name: userName,
            avatar: userAvatar,
            score: 0,
          };
          
          const participantRef = doc(firestore, `quizzes/${quizId}/participants`, user.uid);
          
          setParticipant(newParticipant);
          setDocumentNonBlocking(participantRef, newParticipant, {});

          setStatus('waiting');
        } catch (e) {
          console.error("Error fetching user profile to join quiz:", e);
          setError("Impossibile recuperare il tuo profilo per partecipare. Riprova.");
          setStatus('loading');
        }
      };
      
      joinQuiz();
    }
  }, [user, quiz, participant, firestore, quizId, status]);

  // Effect to listen for quiz state changes from Firestore
  useEffect(() => {
    if (!quizDocRef) return;

    const unsubscribe = onSnapshot(quizDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const quizData = docSnap.data() as Quiz;
            const prevQuizState = quiz?.state;
            setQuiz(quizData);

            if (participant) {
                const currentQuestionFromHost = quizData.questions?.[quizData.currentQuestionIndex];
                 
                if (quizData.state !== 'lobby' && quizData.participants && !quizData.participants.some(p => p.id === participant.id)) {
                    setStatus('loading');
                    setParticipant(null);
                    setError("Sei stato rimosso dal quiz dall'host.");
                    return;
                }
                
                const hasAlreadyAnswered = quizData.answers?.some(
                    a => a.participantId === participant.id && a.questionId === currentQuestionFromHost?.id
                );

                if (quizData.state === 'live' && currentQuestionFromHost) {
                    if (hasAlreadyAnswered) {
                        setStatus('answered');
                    } else {
                        // Check if it's a new question to reset the state
                        if (quiz?.currentQuestionIndex !== quizData.currentQuestionIndex || prevQuizState !== 'live') {
                            setAnswer('');
                            setReorderAnswers(currentQuestionFromHost.options ? [...currentQuestionFromHost.options].sort(() => Math.random() - 0.5) : []);
                            setStartTime(Date.now());
                            setStatus('question');
                        }
                    }
                } else if (quizData.state === 'question-results') {
                    // Regardless of whether they answered, if host moves on, they see the results/waiting screen
                    setStatus('question-results');
                } else if (quizData.state === 'results') {
                    setStatus('results');
                } else if (quizData.state === 'lobby' && status === 'loading') {
                    setStatus('waiting');
                }
            }

        } else {
            setError("Quiz non trovato. Controlla il link e riprova.");
        }
    }, (err: FirestoreError) => {
        console.error("Firestore snapshot error on participant view:", err);
        setError("Si è verificato un errore nel caricamento del quiz.");
        if (quizDocRef) {
          const contextualError = new FirestorePermissionError({
              operation: 'get',
              path: quizDocRef.path,
          });
          errorEmitter.emit('permission-error', contextualError);
        }
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizDocRef, participant]);
  
  const handleSubmit = () => {
    if (!startTime || !quiz || !participant || !firestore || !quiz.questions) return;

    const currentQuestion = quiz.questions[quiz.currentQuestionIndex];
    if (!currentQuestion) return;

    const responseTime = (Date.now() - startTime) / 1000;
    
    // Use participant ID as answer doc ID to ensure one answer per participant per question
    const answerRef = doc(firestore, `quizzes/${quizId}/questions/${currentQuestion.id}/answers`, participant.id);

    const answerPayload: Omit<Answer, 'isCheating' | 'cheatingReason' | 'score'> = {
        participantId: participant.id,
        questionId: currentQuestion.id,
        responseTime: parseFloat(responseTime.toFixed(2)),
        answerText: currentQuestion.type === 'reorder' ? `Ordine: ${reorderAnswers.join(', ')}` : answer,
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
  const myFinalData = quiz?.participants?.find(p => p.id === participant?.id);
  const finalScore = myFinalData?.score || 0;


  const renderContent = () => {
    if (status === 'loading' || status === 'joining' || !quiz) {
        return (
             <div className="flex flex-col items-center gap-4 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">{status === 'joining' ? 'Unendoti al quiz...' : 'Caricamento...'}</p>
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
        const myAnswer = status === 'question-results' && currentQuestion ? quiz.answers?.find(a => a.participantId === participant?.id && a.questionId === currentQuestion.id) : undefined;
        
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
                                    {pAnswer && <span className="text-sm font-mono">{pAnswer.responseTime.toFixed(1)}s</span>}
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
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{waitingMessage()}</p>
             {participant && (
                <div className="flex items-center gap-3 rounded-full bg-muted p-2">
                    <Image src={participant.avatar} alt={participant.name} width={32} height={32} className="w-8 h-8 rounded-full" />
                    <span className="font-medium text-sm">{participant.name}</span>
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
            <h2 className="text-2xl font-bold">{currentQuestion.text}</h2>

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
                    {participant && <p className="text-lg font-semibold">Il tuo punteggio finale: {finalScore} punti</p>}
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

    

    

    