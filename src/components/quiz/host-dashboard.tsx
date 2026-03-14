
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, doc, onSnapshot, setDoc, updateDoc, writeBatch, getDocs, getDoc, deleteDoc } from 'firebase/firestore';
import {
  LayoutGrid,
  Copy,
  Trash2,
  PlusCircle,
  Loader2,
  LogOut,
  Zap,
  Trophy,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";

import type { Question, Participant, Answer, Quiz, StoredMedia, AppSettings } from "@/lib/types";
import { detectCheating } from "@/ai/flows/detect-cheating";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth, useFirestore, useMemoFirebase, useUser, useCollection, useDoc } from '@/firebase';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';

import { FileUploaderRegular } from '@uploadcare/react-uploader';
import '@uploadcare/react-uploader/core.css';

import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
  SidebarHeader,
  SidebarContent,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ParticipantsSidebar from "@/components/quiz/participants-sidebar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import MediaGallerySidebar from "@/components/quiz/media-gallery-sidebar";

// Recupera la chiave dalle variabili d'ambiente (sicuro per GitHub/Netlify)
const UPLOADCARE_PUBLIC_KEY = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || "demotoken";

const questionSchema = z.object({
  text: z.string().min(10, "La domanda deve contenere almeno 10 caratteri."),
  type: z.enum(["multiple-choice", "open-ended", "image", "video", "audio", "reorder"]),
  mediaUrl: z.string().optional(),
  answerType: z.enum(["multiple-choice", "open-ended"]).optional(),
  options: z
    .array(z.object({ value: z.string().min(1, "L'opzione non può essere vuota.") }))
    .optional(),
  correctAnswer: z.string().optional(),
});

const ACTIVE_QUIZ_ID_KEY = 'active-quiz-id';
const QUIZ_DRAFT_KEY = 'quiz-draft';

interface HostDashboardProps {
  isReadOnly: boolean;
}

export default function HostDashboard({ isReadOnly }: HostDashboardProps) {
  const [quizId, setQuizId] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [inviteLink, setInviteLink] = useState("");
  const [topics, setTopics] = useState<string[]>(["", "", ""]);
  const [newMediaName, setNewMediaName] = useState("");
  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [newMediaType, setNewMediaType] = useState<'image' | 'video' | 'audio'>('image');
  const { toast } = useToast();
  
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);

  const [questionScores, setQuestionScores] = useState<Record<string, number>>({});
  const [hasScoresSavedForCurrentQ, setHasScoresSavedForCurrentQ] = useState(false);
  const [isSavingScores, setIsSavingScores] = useState(false);
  const [isAddingMedia, setIsAddingMedia] = useState(false);
  
  const auth = useAuth();
  const { user } = useUser();
  const firestore = useFirestore();

  const settingsDocRef = useMemoFirebase(() => doc(firestore, 'settings', 'main'), [firestore]);
  const { data: settings } = useDoc<AppSettings>(settingsDocRef);

  const quizDocRef = useMemoFirebase(() => quizId ? doc(firestore, "quizzes", quizId) : null, [firestore, quizId]);
  const participantsColRef = useMemoFirebase(() => quizId ? collection(firestore, `quizzes/${quizId}/participants`) : null, [firestore, quizId]);

  const mediaGalleryColRef = useMemoFirebase(() => collection(firestore, 'media_gallery'), [firestore]);
  const { data: mediaGallery } = useCollection<StoredMedia>(mediaGalleryColRef);

  const currentQuestion = quiz?.questions?.[quiz.currentQuestionIndex];

  const quizRef = useRef(quiz);
  const participantsRef = useRef(participants);
  const currentQuestionRef = useRef(currentQuestion);

  useEffect(() => {
    quizRef.current = quiz;
    participantsRef.current = participants;
    currentQuestionRef.current = currentQuestion;
  });

  const handleNewAnswer = useCallback(async (answer: Answer) => {
    const currentQuestion = currentQuestionRef.current;
    const currentParticipants = participantsRef.current;

    if (!currentQuestion || isReadOnly) return;

    const { isCheating, reason } = await detectCheating({
      responseTime: answer.responseTime,
      answerText: answer.answerText,
      questionText: currentQuestion.text,
    });
    
    const participant = currentParticipants.find(p => p.id === answer.participantId);

    if (isCheating && participant) {
      toast({
        variant: "destructive",
        title: "Sospetto Cheating!",
        description: `${participant.name} potrebbe barare: ${reason}`,
      });
    }
  }, [isReadOnly, toast]);

  const resetQuiz = useCallback(() => {
    if (isReadOnly || !user) return;
    setQuizId(null);
    setQuiz({
      id: '',
      name: "Il Mio Quiz Fantastico",
      hostId: user?.uid || '',
      state: "creating",
      questions: [],
      currentQuestionIndex: 0,
      topics: ["", "", ""],
    });
    setTopics(["", "", ""]);
    setParticipants([]);
    setAnswers([]);
    setQuestionScores({});
    setHasScoresSavedForCurrentQ(false);
    setIsSavingScores(false);
    try {
      localStorage.removeItem(ACTIVE_QUIZ_ID_KEY);
      localStorage.removeItem(QUIZ_DRAFT_KEY);
    } catch (error) {
        console.error("Error clearing session:", error);
    }
  }, [isReadOnly, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const activeQuizId = localStorage.getItem(ACTIVE_QUIZ_ID_KEY);
      if (activeQuizId) {
        setQuizId(activeQuizId);
        return;
      }
      const draftJson = localStorage.getItem(QUIZ_DRAFT_KEY);
      if (draftJson) {
        const draftQuiz = JSON.parse(draftJson) as Quiz;
        if (draftQuiz && draftQuiz.state === 'creating') {
          setQuiz(draftQuiz);
          if (draftQuiz.topics) setTopics(draftQuiz.topics);
          return;
        }
      }
    } catch (error) {
      console.error("Error restoring session:", error);
    }
  }, []);

  useEffect(() => {
    if (!quizDocRef) return;
    const unsubscribe = onSnapshot(quizDocRef, (doc) => {
      if (doc.exists()) {
        setQuiz(doc.data() as Quiz);
      } else {
        resetQuiz();
      }
    });
    return () => unsubscribe();
  }, [quizDocRef, resetQuiz]);

  useEffect(() => {
    if (!participantsColRef) return;
    const unsubscribe = onSnapshot(participantsColRef, (snapshot) => {
      setParticipants(snapshot.docs.map(doc => doc.data() as Participant));
    });
    return () => unsubscribe();
  }, [participantsColRef]);

  const questionsIdentifier = useMemo(() => quiz?.questions.map(q => q.id).join(','), [quiz?.questions]);

  useEffect(() => {
    if (!quizId || !questionsIdentifier) return;
    const questions = quizRef.current?.questions || [];
    const unsubscribers = questions.map(q => {
        const questionAnswersColRef = collection(firestore, `quizzes/${quizId}/questions/${q.id}/answers`);
        return onSnapshot(questionAnswersColRef, (snapshot) => {
            const newAnswers = snapshot.docs.map(doc => doc.data() as Answer);
            setAnswers(prev => {
                const other = prev.filter(ans => ans.questionId !== q.id);
                return [...other, ...newAnswers];
            });
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') handleNewAnswer(change.doc.data() as Answer);
            });
        });
    });
    return () => unsubscribers.forEach(unsub => unsub());
  }, [quizId, questionsIdentifier, firestore, handleNewAnswer]);

  const handleAddExternalMedia = async () => {
    if (isReadOnly || !newMediaUrl || !newMediaName) {
      toast({ variant: "destructive", title: "Campi mancanti", description: "Inserisci nome e URL." });
      return;
    }
    setIsAddingMedia(true);
    try {
        const mediaId = uuidv4();
        const mediaData: StoredMedia = {
            id: mediaId,
            name: newMediaName,
            type: newMediaType,
            url: newMediaUrl,
            createdAt: new Date().toISOString()
        };
        await setDoc(doc(firestore, 'media_gallery', mediaId), mediaData);
        setNewMediaName("");
        setNewMediaUrl("");
        toast({ title: "Media Aggiunto!", description: "Il media è ora nella tua galleria." });
    } catch (e) {
        toast({ variant: "destructive", title: "Errore", description: "Impossibile salvare il media." });
    } finally {
        setIsAddingMedia(false);
    }
  };

  const deleteMedia = async (media: StoredMedia) => {
    if (isReadOnly) return;
    try {
        await deleteDoc(doc(firestore, 'media_gallery', media.id));
        toast({ title: "Media rimosso" });
    } catch (e) {
        toast({ variant: "destructive", title: "Errore eliminazione" });
    }
  };

  const form = useForm<z.infer<typeof questionSchema>>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      text: "",
      type: "multiple-choice",
      options: [{ value: "" }, { value: "" }, { value: "" }, { value: "" }],
      correctAnswer: "0",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "options",
  });

  const questionType = form.watch("type");
  const answerType = form.watch("answerType");

  const onSubmit = (data: z.infer<typeof questionSchema>) => {
    if (!quiz || isReadOnly) return;
    let correctAnswerValue: string | null = null;
    const isMultipleChoice = data.type === 'multiple-choice' || (['image','video','audio'].includes(data.type) && data.answerType === 'multiple-choice');
    if (isMultipleChoice && data.correctAnswer) {
        correctAnswerValue = data.options?.[parseInt(data.correctAnswer!)]?.value || null;
    } else if (data.type === 'open-ended' || (['image','video','audio'].includes(data.type) && data.answerType === 'open-ended')) {
        correctAnswerValue = data.correctAnswer || null;
    }

    const newQuestion: Question = {
      id: uuidv4(),
      text: data.text,
      type: data.type,
      mediaUrl: data.mediaUrl || null,
      answerType: data.answerType || null,
      options: data.options?.map((o) => o.value) || [],
      correctAnswer: correctAnswerValue,
      correctOrder: data.type === 'reorder' ? data.options?.map(o => o.value) || [] : [],
    };
    setQuiz(prev => prev ? ({ ...prev, questions: [...prev.questions, newQuestion] }) : null);
    form.reset({ text: "", type: data.type, answerType: data.answerType, options: data.options, correctAnswer: data.correctAnswer });
  };

  const startQuiz = async () => {
    if (!quiz || isReadOnly || !user) return;
    const newQuizId = uuidv4().slice(0, 8);
    const state: Quiz = { ...quiz, id: newQuizId, state: "lobby", currentQuestionIndex: 0, topics };
    await setDoc(doc(firestore, "quizzes", newQuizId), state);
    setQuizId(newQuizId);
    setInviteLink(`${window.location.origin}/join/${newQuizId}`);
  };

  const beginQuiz = () => quizDocRef && updateDocumentNonBlocking(quizDocRef, { state: "live", currentQuestionIndex: 0 });
  const showResults = () => quizDocRef && updateDocumentNonBlocking(quizDocRef, { state: "question-results" });

  const saveScores = async () => {
    if (!quizId || !participantsColRef || !currentQuestion || isReadOnly) return;
    setIsSavingScores(true);
    try {
        const batch = writeBatch(firestore);
        const snapshot = await getDocs(participantsColRef);
        snapshot.docs.forEach(d => {
            const score = questionScores[d.id] ?? 0;
            const ref = doc(firestore, `quizzes/${quizId}/questions/${currentQuestion.id}/answers`, d.id);
            batch.set(ref, { score }, { merge: true });
        });
        await batch.commit();
        setHasScoresSavedForCurrentQ(true);
        toast({ title: "Punteggi Salvati!" });
    } catch (e) {
        toast({ variant: "destructive", title: "Errore salvataggio" });
    } finally {
        setIsSavingScores(false);
    }
  };

  const nextQuestion = async () => {
    if (!quiz || !quizDocRef || isReadOnly) return;
    if (quiz.currentQuestionIndex < quiz.questions.length - 1) {
        updateDocumentNonBlocking(quizDocRef, { state: "live", currentQuestionIndex: quiz.currentQuestionIndex + 1 });
        setQuestionScores({});
        setHasScoresSavedForCurrentQ(false);
    } else {
        const batch = writeBatch(firestore);
        const snapshot = await getDocs(participantsColRef!);
        for (const d of snapshot.docs) {
            let total = 0;
            for (const q of quiz.questions) {
                const snap = await getDoc(doc(firestore, `quizzes/${quiz.id}/questions/${q.id}/answers`, d.id));
                if (snap.exists()) total += (snap.data().score || 0);
            }
            batch.update(d.ref, { score: total });
        }
        await batch.commit();
        updateDocumentNonBlocking(quizDocRef, { state: "results" });
    }
  };

  const toggleJolly = () => settingsDocRef && updateDocumentNonBlocking(settingsDocRef, { jollyEnabled: !settings?.jollyEnabled });
  const toggleBoard = () => settingsDocRef && updateDocumentNonBlocking(settingsDocRef, { leaderboardEnabled: !settings?.leaderboardEnabled });

  if (!quiz) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  const currentAnswers = answers.filter(a => a.questionId === currentQuestion?.id) || [];

  return (
    <SidebarProvider>
      <div className="h-screen flex flex-col w-full">
        <header className="flex h-14 items-center gap-4 border-b bg-card px-4 lg:px-6">
            <SidebarTrigger className="md:hidden"/>
            <div className="flex items-center gap-2 font-semibold">
                <LayoutGrid className="h-6 w-6 text-primary" />
                <span className="font-headline text-xl hidden sm:inline">MaestroDiQuiz</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
                <div className="flex items-center gap-3 px-3 border-r">
                  <div className="flex items-center gap-1">
                    <Zap className={cn("h-4 w-4", settings?.jollyEnabled ? "text-yellow-500" : "text-muted-foreground")} />
                    <Switch checked={settings?.jollyEnabled} onCheckedChange={toggleJolly} disabled={isReadOnly} />
                  </div>
                  <div className="flex items-center gap-1">
                    <Trophy className={cn("h-4 w-4", settings?.leaderboardEnabled ? "text-primary" : "text-muted-foreground")} />
                    <Switch checked={settings?.leaderboardEnabled} onCheckedChange={toggleBoard} disabled={isReadOnly} />
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => auth.signOut()}><LogOut className="h-5 w-5"/></Button>
            </div>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <Sidebar>
            <SidebarHeader className="p-4"><h2 className="text-lg font-bold font-headline">Sessione</h2></SidebarHeader>
            <SidebarContent>
              <ParticipantsSidebar participants={participants} leaderboard={[]} onResetLeaderboard={() => {}} isReadOnly={isReadOnly} />
              <MediaGallerySidebar mediaItems={mediaGallery || []} onDeleteMedia={deleteMedia} isReadOnly={isReadOnly} />
            </SidebarContent>
          </Sidebar>
          <SidebarInset className="p-4 sm:p-6 overflow-auto bg-background/50">
            {quiz.state === 'creating' ? (
                <div className="max-w-4xl mx-auto space-y-6">
                    <Card>
                        <CardHeader><CardTitle className="font-headline">Aggiungi Media alla Galleria</CardTitle><CardDescription>Carica un file o incolla un link esterno (Supabase, Imgur, etc).</CardDescription></CardHeader>
                        <CardContent className="space-y-4">
                           <div className="grid gap-4 sm:grid-cols-3">
                                <Input placeholder="Nome Media (es. Sigla)" value={newMediaName} onChange={e => setNewMediaName(e.target.value)} disabled={isReadOnly}/>
                                <Input placeholder="URL Media" value={newMediaUrl} onChange={e => setNewMediaUrl(e.target.value)} disabled={isReadOnly}/>
                                <Select value={newMediaType} onValueChange={v => setNewMediaType(v as any)} disabled={isReadOnly}>
                                    <SelectTrigger><SelectValue placeholder="Tipo Media"/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="image">Immagine</SelectItem>
                                        <SelectItem value="video">Video</SelectItem>
                                        <SelectItem value="audio">Audio</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-4 items-center">
                                <div className="w-full sm:w-auto">
                                  <FileUploaderRegular
                                      pubkey={UPLOADCARE_PUBLIC_KEY} 
                                      maxLocalFileCount={1}
                                      imgOnly={newMediaType === 'image'}
                                      onFileUploadSuccess={(fileInfo) => {
                                          setNewMediaUrl(fileInfo.cdnUrl || "");
                                          if (!newMediaName) setNewMediaName(fileInfo.name || "Nuovo Media");
                                          toast({ title: "File caricato!", description: "L'URL è stato generato. Clicca 'Salva' per aggiungerlo alla galleria." });
                                      }}
                                  />
                                </div>
                                <Button className="w-full sm:flex-1" onClick={handleAddExternalMedia} disabled={isReadOnly || isAddingMedia}>
                                    {isAddingMedia ? <Loader2 className="animate-spin mr-2"/> : <PlusCircle className="mr-2"/>} Salva nella Galleria
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle className="font-headline">Configura Quiz</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <Input placeholder="Nome Quiz" value={quiz.name} onChange={e => setQuiz({...quiz, name: e.target.value})} disabled={isReadOnly}/>
                            <div className="grid grid-cols-3 gap-2">
                                {topics.map((t,i) => <Input key={i} placeholder={`Tema ${i+1}`} value={t} onChange={e => {const n=[...topics]; n[i]=e.target.value; setTopics(n)}} disabled={isReadOnly}/>)}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle className="font-headline">Domande</CardTitle></CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={form.control} name="type" render={({field}) => (
                                            <FormItem>
                                                <FormLabel>Tipo</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                      <SelectTrigger><SelectValue placeholder="Seleziona tipo"/></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="multiple-choice">Scelta Multipla</SelectItem>
                                                        <SelectItem value="open-ended">Aperta</SelectItem>
                                                        <SelectItem value="image">Immagine</SelectItem>
                                                        <SelectItem value="video">Video</SelectItem>
                                                        <SelectItem value="audio">Audio</SelectItem>
                                                        <SelectItem value="reorder">Riordina</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </FormItem>
                                        )}/>
                                        {['image','video','audio'].includes(questionType) && (
                                            <FormField control={form.control} name="answerType" render={({field}) => (
                                                <FormItem>
                                                    <FormLabel>Risposta</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                          <SelectTrigger><SelectValue placeholder="Tipo risposta"/></SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="multiple-choice">Scelta Multipla</SelectItem>
                                                            <SelectItem value="open-ended">Aperta</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )}/>
                                        )}
                                    </div>
                                    <FormField control={form.control} name="text" render={({field}) => <FormItem><FormLabel>Domanda</FormLabel><Textarea {...field}/></FormItem>}/>
                                    {['image','video','audio'].includes(questionType) && (
                                        <FormField control={form.control} name="mediaUrl" render={({field}) => (
                                            <FormItem>
                                                <FormLabel>URL Media</FormLabel>
                                                <Input {...field} placeholder="Incolla URL dalla galleria o esterno" className="flex-1" />
                                            </FormItem>
                                        )} />
                                    )}
                                    <Button type="submit" variant="secondary" disabled={isReadOnly}>Aggiungi Domanda</Button>
                                </form>
                            </Form>
                            <div className="mt-6 space-y-2">
                                {quiz.questions.map((q,i) => (
                                    <div key={q.id} className="flex items-center justify-between p-3 border rounded-lg">
                                        <span className="text-sm font-medium">{i+1}. {q.text}</span>
                                        <Button size="icon" variant="ghost" onClick={() => setQuiz({...quiz, questions: quiz.questions.filter(x => x.id !== q.id)})} disabled={isReadOnly}><Trash2 className="h-4 w-4"/></Button>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                        <CardFooter><Button className="w-full" onClick={startQuiz} disabled={isReadOnly || quiz.questions.length === 0}>Crea Lobby</Button></CardFooter>
                    </Card>
                </div>
            ) : quiz.state === 'lobby' ? (
                <Card className="max-w-2xl mx-auto text-center p-6 space-y-6">
                    <CardTitle className="text-3xl font-headline">Lobby</CardTitle>
                    <div className="p-4 bg-muted rounded-lg flex items-center justify-center gap-2 font-mono break-all">{inviteLink}<Button variant="ghost" onClick={() => {navigator.clipboard.writeText(inviteLink); toast({title:"Copiato!"})}}><Copy/></Button></div>
                    <div className="flex flex-wrap justify-center gap-4">
                        {participants.map(p => <div key={p.id} className="text-center"><img src={p.avatar} className="w-12 h-12 rounded-full mx-auto"/><span className="text-xs">{p.name}</span></div>)}
                    </div>
                    <Button size="lg" className="w-full" onClick={beginQuiz} disabled={isReadOnly || participants.length === 0}>Inizia Quiz</Button>
                </Card>
            ) : (
                <div className="max-w-4xl mx-auto space-y-6">
                    <Card>
                        <CardHeader className="flex flex-row justify-between items-center"><CardTitle className="text-2xl">{currentQuestion?.text}</CardTitle><Badge variant="outline">Domanda {quiz.currentQuestionIndex + 1}</Badge></CardHeader>
                        <CardContent>
                            {currentQuestion?.mediaUrl && (
                                <div className="max-w-md mx-auto mb-4">
                                    {currentQuestion.type === 'image' && <img src={currentQuestion.mediaUrl} className="rounded-lg w-full" alt="Domanda"/>}
                                    {currentQuestion.type === 'video' && <video src={currentQuestion.mediaUrl} controls className="w-full"/>}
                                    {currentQuestion.type === 'audio' && <audio src={currentQuestion.mediaUrl} controls className="w-full"/>}
                                </div>
                            )}
                            <div className="space-y-3">
                                {participants.map(p => {
                                    const ans = currentAnswers.find(a => a.participantId === p.id);
                                    return (
                                        <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg bg-card shadow-sm">
                                            <div className="flex items-center gap-3"><img src={p.avatar} className="w-8 h-8 rounded-full" alt={p.name}/><span>{p.name}</span></div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-xs text-muted-foreground">{ans?.answerText || "In attesa..."}</span>
                                                <div className="flex items-center gap-1">
                                                    <Input type="number" className="w-16 h-8" defaultValue={questionScores[p.id] || 0} onChange={e => {setHasScoresSavedForCurrentQ(false); setQuestionScores({...questionScores, [p.id]: parseInt(e.target.value)})}} disabled={isReadOnly}/>
                                                    <span className="text-xs">pti</span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-end gap-2">
                            {quiz.state === 'live' && <Button onClick={showResults} disabled={isReadOnly}>Blocca e Mostra Risposte</Button>}
                            <Button onClick={saveScores} disabled={isReadOnly || isSavingScores || hasScoresSavedForCurrentQ}>Salva Punteggi</Button>
                            <Button onClick={nextQuestion} disabled={isReadOnly || !hasScoresSavedForCurrentQ} style={{background: 'hsl(var(--accent))'}}>{quiz.currentQuestionIndex < quiz.questions.length - 1 ? "Avanti" : "Fine Quiz"}</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
