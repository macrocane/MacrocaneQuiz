"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, doc, onSnapshot, setDoc, writeBatch, FirestoreError, getDocs, getDoc, increment, query, orderBy } from 'firebase/firestore';
import {
  ArrowRight,
  ClipboardPlus,
  Copy,
  LayoutGrid,
  Link as LinkIcon,
  ListChecks,
  Play,
  Trash2,
  Trophy,
  AlertTriangle,
  Upload,
  GripVertical,
  Pencil,
  Home,
  SkipForward,
  Eye,
  LogOut,
  Loader2,
  RefreshCw,
  Save,
  Zap,
  Tags,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { FileUploaderRegular } from '@uploadcare/react-uploader/next';
import '@uploadcare/react-uploader/core.css';

import type { Question, Participant, Answer, Quiz, LeaderboardEntry, StoredMedia, AppSettings } from "@/lib/types";
import { detectCheating } from "@/ai/flows/detect-cheating";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth, useFirestore, useMemoFirebase, useUser, useCollection, useDoc } from '@/firebase';
import { updateDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';

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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ParticipantsSidebar from "@/components/quiz/participants-sidebar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import MediaGallerySidebar from "@/components/quiz/media-gallery-sidebar";
import { Switch } from "@/components/ui/switch";

const UPLOADCARE_PUB_KEY = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || 'demotoken';

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
  const { toast } = useToast();
  
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);

  const [questionScores, setQuestionScores] = useState<Record<string, number>>({});
  const [hasScoresSavedForCurrentQ, setHasScoresSavedForCurrentQ] = useState(false);
  const [isSavingScores, setIsSavingScores] = useState(false);
  
  const auth = useAuth();
  const { user } = useUser();
  const firestore = useFirestore();

  const settingsDocRef = useMemoFirebase(() => doc(firestore, 'settings', 'main'), [firestore]);
  const { data: settings } = useDoc<AppSettings>(settingsDocRef);

  const mediaColRef = useMemoFirebase(() => collection(firestore, 'media_gallery'), [firestore]);
  const { data: mediaGallery } = useCollection<StoredMedia>(useMemoFirebase(() => query(mediaColRef, orderBy('createdAt', 'desc')), [mediaColRef]));

  const quizDocRef = useMemoFirebase(() => quizId ? doc(firestore, "quizzes", quizId) : null, [firestore, quizId]);
  const participantsColRef = useMemoFirebase(() => quizId ? collection(firestore, `quizzes/${quizId}/participants`) : null, [firestore, quizId]);

  const rankingsColRef = useMemoFirebase(() => collection(firestore, 'monthly_rankings'), [firestore]);
  const { data: leaderboard } = useCollection<LeaderboardEntry>(rankingsColRef);

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
    const currentQuiz = quizRef.current;
    const currentQuestion = currentQuestionRef.current;
    const currentParticipants = participantsRef.current;

    if (!currentQuiz || !currentQuestion || isReadOnly) return;

    const { isCheating, reason } = await detectCheating({
      responseTime: answer.responseTime,
      answerText: answer.answerText,
      questionText: currentQuestion.text,
    });
    
    const participant = currentParticipants.find(p => p.id === answer.participantId);

    if (isCheating && participant) {
      toast({
        variant: "destructive",
        title: "Potenziale Tentativo di Barare Rilevato!",
        description: `Potrebbe essere che ${participant.name} stia barando. Motivo: ${reason}`,
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem(ACTIVE_QUIZ_ID_KEY);
      localStorage.removeItem(QUIZ_DRAFT_KEY);
    }
  }, [isReadOnly, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const activeQuizId = localStorage.getItem(ACTIVE_QUIZ_ID_KEY);
    if (activeQuizId) {
      setQuizId(activeQuizId);
    } else {
      const draftJson = localStorage.getItem(QUIZ_DRAFT_KEY);
      if (draftJson) {
        try {
          const draftQuiz = JSON.parse(draftJson) as Quiz;
          if (draftQuiz && draftQuiz.state === 'creating') {
            setQuiz(draftQuiz);
            if (draftQuiz.topics) setTopics(draftQuiz.topics);
          }
        } catch (e) {
          console.error("Draft parsing failed", e);
        }
      }
    }
    
    if (!quiz && !activeQuizId) {
        setQuiz({
            id: '',
            name: "Il Mio Quiz Fantastico",
            hostId: user?.uid || '',
            state: "creating",
            questions: [],
            currentQuestionIndex: 0,
            topics: ["", "", ""],
        });
    }
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (quizId && quiz?.state !== 'creating') {
      localStorage.setItem(ACTIVE_QUIZ_ID_KEY, quizId);
      localStorage.removeItem(QUIZ_DRAFT_KEY);
    } else if (quiz?.state === 'creating') {
      if (quiz.questions.length > 0 || quiz.name !== "Il Mio Quiz Fantastico") {
        localStorage.setItem(QUIZ_DRAFT_KEY, JSON.stringify({ ...quiz, topics }));
      }
    }
  }, [quiz, quizId, topics]);
  
  useEffect(() => {
    if (!quizDocRef) return;
    const unsubscribe = onSnapshot(quizDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const quizData = docSnap.data() as Quiz;
        setQuiz(quizData);
      } else {
        resetQuiz();
      }
    });
    return () => unsubscribe();
  }, [quizDocRef, resetQuiz]);

  useEffect(() => {
    if (!participantsColRef) {
      setParticipants([]);
      return;
    }
    const unsubscribe = onSnapshot(participantsColRef, (snapshot) => {
      setParticipants(snapshot.docs.map(doc => doc.data() as Participant));
    });
    return () => unsubscribe();
  }, [participantsColRef]);

  useEffect(() => {
    if (!quizId || !quiz?.questions?.length) {
        setAnswers([]);
        return;
    }
    const questions = quiz.questions;
    const unsubscribers = questions.map(q => {
        const qAnswersRef = collection(firestore, `quizzes/${quizId}/questions/${q.id}/answers`);
        return onSnapshot(qAnswersRef, (snapshot) => {
            const newAnswers = snapshot.docs.map(doc => doc.data() as Answer);
            setAnswers(prev => {
                const others = prev.filter(ans => ans.questionId !== q.id);
                return [...others, ...newAnswers];
            });
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') handleNewAnswer(change.doc.data() as Answer);
            });
        });
    });
    return () => unsubscribers.forEach(unsub => unsub());
  }, [quizId, quiz?.questions, firestore, handleNewAnswer]);

  const handleFileUploadSuccess = (fileInfo: any) => {
    if (isReadOnly) return;
    const dataUrl = fileInfo.cdnUrl;
    const newMedia: StoredMedia = {
        id: uuidv4(),
        name: fileInfo.name || 'File caricato',
        type: fileInfo.isImage ? 'image/url' : 'file/url',
        url: dataUrl,
        createdAt: new Date().toISOString()
    };
    setDocumentNonBlocking(doc(firestore, 'media_gallery', newMedia.id), newMedia, { merge: true });
    form.setValue('mediaUrl', dataUrl);
    toast({ title: "Media Caricato!", description: "Il file è pronto per essere usato." });
  }

  const deleteMedia = (id: string) => {
    if (isReadOnly) return;
    setDoc(doc(firestore, 'media_gallery', id), { deleted: true }, { merge: true });
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

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "options" });
  const questionType = form.watch("type");
  const answerType = form.watch("answerType");

  const onSubmit = (data: z.infer<typeof questionSchema>) => {
    if (!quiz || isReadOnly) return;
    const isMultipleChoice = data.type === 'multiple-choice' || (['image','video','audio'].includes(data.type) && data.answerType === 'multiple-choice');
    const newQuestion: Question = {
      id: uuidv4(),
      text: data.text,
      type: data.type,
      mediaUrl: data.mediaUrl || null,
      answerType: data.answerType || null,
      options: data.options?.map((o) => o.value) || [],
      correctAnswer: isMultipleChoice ? data.options?.[parseInt(data.correctAnswer!)]?.value || null : data.correctAnswer || null,
      correctOrder: data.type === 'reorder' ? data.options?.map(o => o.value) || [] : [],
    };
    setQuiz(prev => prev ? ({ ...prev, questions: [...prev.questions, newQuestion] }) : null);
    form.reset({ text: "", type: data.type, answerType: data.answerType, options: data.options, correctAnswer: "0" });
  };

  const startQuiz = async () => {
    if (!quiz || isReadOnly || !user) return;
    const newQuizId = uuidv4().slice(0, 8);
    const newQuizDocRef = doc(firestore, "quizzes", newQuizId);
    try {
      await setDoc(newQuizDocRef, { ...quiz, id: newQuizId, hostId: user.uid, state: "lobby", topics });
      setQuizId(newQuizId);
      setInviteLink(`${window.location.origin}/join/${newQuizId}`);
    } catch (error) {
      toast({ variant: "destructive", title: "Errore!", description: "Impossibile creare il quiz." });
    }
  };

  const beginQuiz = () => quizDocRef && updateDocumentNonBlocking(quizDocRef, { state: "live", currentQuestionIndex: 0 });
  const showQuestionResults = () => quizDocRef && updateDocumentNonBlocking(quizDocRef, { state: "question-results" });

  const saveScoresForCurrentQuestion = async () => {
    if (!quizId || !currentQuestion || isReadOnly) return;
    setIsSavingScores(true);
    try {
        const batch = writeBatch(firestore);
        participants.forEach(p => {
            const score = questionScores[p.id] ?? 0;
            const answerRef = doc(firestore, `quizzes/${quizId}/questions/${currentQuestion.id}/answers`, p.id);
            batch.set(answerRef, { score }, { merge: true });
        });
        await batch.commit();
        setHasScoresSavedForCurrentQ(true);
        toast({ title: "Punteggi Salvati!" });
    } catch (error) {
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
        for (const p of participants) {
            let total = 0;
            for (const q of quiz.questions) {
                const answerSnap = await getDoc(doc(firestore, `quizzes/${quiz.id}/questions/${q.id}/answers`, p.id));
                if (answerSnap.exists()) total += (answerSnap.data().score || 0);
            }
            batch.update(doc(firestore, `quizzes/${quiz.id}/participants`, p.id), { score: total });
        }
        await batch.commit();
        updateDocumentNonBlocking(quizDocRef, { state: "results" });
    }
  };

  const toggleJollyFunction = () => settingsDocRef && updateDocumentNonBlocking(settingsDocRef, { jollyEnabled: !settings?.jollyEnabled });
  const toggleLeaderboardVisibility = () => settingsDocRef && updateDocumentNonBlocking(settingsDocRef, { leaderboardEnabled: !settings?.leaderboardEnabled });

  const renderContent = () => {
    if (!quiz) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

    switch (quiz.state) {
      case "creating":
        const showOptions = questionType === "multiple-choice" || (['image', 'video', 'audio'].includes(questionType) && answerType === 'multiple-choice');
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="font-headline flex items-center gap-2"><Pencil size={24} /> Dettagli del Quiz</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Input value={quiz.name} onChange={(e) => setQuiz(prev => prev ? ({ ...prev, name: e.target.value }) : null)} placeholder="Nome del Quiz" disabled={isReadOnly} />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {topics.map((t, i) => (
                    <Input key={i} placeholder={`Tema ${i + 1}`} value={t} onChange={(e) => { const n = [...topics]; n[i] = e.target.value; setTopics(n); }} disabled={isReadOnly} />
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="font-headline flex items-center gap-2"><ClipboardPlus size={24} /> Crea Domanda</CardTitle></CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="type" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo</FormLabel>
                          <Select onValueChange={(v) => { field.onChange(v); form.setValue('answerType', v === 'multiple-choice' ? undefined : 'multiple-choice'); }} value={field.value} disabled={isReadOnly}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
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
                      )} />
                      {['image', 'video', 'audio'].includes(questionType) && (
                        <FormField control={form.control} name="answerType" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Risposta</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value!} disabled={isReadOnly}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="multiple-choice">Scelta Multipla</SelectItem>
                                <SelectItem value="open-ended">Aperta</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                      )}
                    </div>
                    <FormField control={form.control} name="text" render={({ field }) => (
                      <FormItem><FormLabel>Domanda</FormLabel><FormControl><Textarea {...field} disabled={isReadOnly} /></FormControl></FormItem>
                    )} />
                    {['image', 'video', 'audio'].includes(questionType) && (
                        <div className="space-y-4">
                            <Label>Carica o Incolla URL</Label>
                            <div className="flex flex-col gap-4">
                                <FileUploaderRegular
                                    pubkey={UPLOADCARE_PUB_KEY}
                                    onFileUploadSuccess={handleFileUploadSuccess}
                                    imgOnly={questionType === 'image'}
                                />
                                <FormField control={form.control} name="mediaUrl" render={({ field }) => (
                                    <Input placeholder="Incolla URL qui" {...field} value={field.value || ""} disabled={isReadOnly} />
                                )} />
                            </div>
                        </div>
                    )}
                    {showOptions && fields.map((item, index) => (
                        <FormField key={item.id} control={form.control} name={`options.${index}.value`} render={({ field }) => (
                            <div className="flex gap-2 items-center">
                                <RadioGroup value={form.watch('correctAnswer')} onValueChange={(v) => form.setValue('correctAnswer', v)}><RadioGroupItem value={index.toString()} /></RadioGroup>
                                <Input {...field} disabled={isReadOnly} />
                                <Button size="icon" variant="ghost" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                        )} />
                    ))}
                    {showOptions && <Button type="button" variant="outline" onClick={() => append({ value: "" })}>Aggiungi Opzione</Button>}
                    <Button type="submit" className="w-full">Aggiungi Domanda</Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
            {quiz.questions.map((q, i) => (
                <div key={q.id} className="p-3 border rounded-lg flex justify-between items-center bg-card">
                    <span>{i + 1}. {q.text}</span>
                    <Button variant="ghost" size="icon" onClick={() => setQuiz(prev => prev ? ({ ...prev, questions: prev.questions.filter(qu => qu.id !== q.id) }) : null)}><Trash2 className="h-4 w-4" /></Button>
                </div>
            ))}
            <Button onClick={startQuiz} className="w-full" size="lg" disabled={!quiz.questions.length || isReadOnly}>Crea Lobby <ArrowRight className="ml-2" /></Button>
          </div>
        );
      case "lobby":
        return (
          <Card className="text-center p-6 space-y-6">
            <CardTitle className="text-3xl">Lobby del Quiz</CardTitle>
            <div className="p-4 bg-muted font-mono flex items-center justify-center gap-2 rounded-lg">
              {inviteLink} 
              <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(inviteLink); toast({ title: "Link Copiato!" }); }}><Copy size={16} /></Button>
            </div>
            <div className="flex justify-center gap-4 flex-wrap">
              {participants.map(p => <div key={p.id} className="text-center"><img src={p.avatar} className="w-12 h-12 rounded-full mb-1 mx-auto" alt={p.name} />{p.name}</div>)}
              {participants.length === 0 && <p className="text-muted-foreground">In attesa di partecipanti...</p>}
            </div>
            <Button onClick={beginQuiz} className="w-full" size="lg" disabled={isReadOnly}>Inizia Quiz</Button>
          </Card>
        );
      case "live":
      case "question-results":
        return (
          <div className="space-y-6">
            <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <Badge variant="outline">Domanda {quiz.currentQuestionIndex + 1} di {quiz.questions.length}</Badge>
                  <Badge className="bg-primary">{currentQuestion?.type.toUpperCase()}</Badge>
                </div>
                <CardTitle className="text-2xl mb-4">{currentQuestion?.text}</CardTitle>
                {currentQuestion?.mediaUrl && (
                  <div className="relative aspect-video max-h-64 mx-auto my-4 overflow-hidden rounded-lg">
                    {currentQuestion.type === 'image' ? <img src={currentQuestion.mediaUrl} className="object-contain w-full h-full" alt="Domanda" /> : 
                     currentQuestion.type === 'video' ? <video src={currentQuestion.mediaUrl} controls className="w-full h-full" /> : 
                     <audio src={currentQuestion.mediaUrl} controls className="w-full mt-10" />}
                  </div>
                )}
                <Progress value={((quiz.currentQuestionIndex + 1) / quiz.questions.length) * 100} className="mt-6" />
            </Card>
            <Card className="p-6 space-y-4">
                <CardTitle className="flex justify-between items-center">
                  <span>Risposte Ricevute</span>
                  <Badge variant="secondary">{answers.filter(a => a.questionId === currentQuestion?.id).length}/{participants.length}</Badge>
                </CardTitle>
                <div className="space-y-2">
                  {participants.map(p => {
                      const ans = answers.find(a => a.participantId === p.id && a.questionId === currentQuestion?.id);
                      return (
                          <div key={p.id} className="flex justify-between items-center p-3 border rounded bg-card">
                              <div className="flex items-center gap-2">
                                <img src={p.avatar} className="w-8 h-8 rounded-full" alt={p.name} />
                                <span className="font-medium">{p.name}:</span>
                                <span className="text-muted-foreground italic">{ans?.answerText || "In attesa..."}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Label className="text-xs">Punti:</Label>
                                <Input type="number" value={questionScores[p.id] ?? 0} onChange={(e) => setQuestionScores({ ...questionScores, [p.id]: parseInt(e.target.value) || 0 })} className="w-20 h-8" disabled={isReadOnly} />
                              </div>
                          </div>
                      );
                  })}
                </div>
                <div className="flex gap-2 pt-4">
                    <Button variant="outline" onClick={showQuestionResults} disabled={isReadOnly}>Mostra Corretta</Button>
                    <Button variant="secondary" onClick={saveScoresForCurrentQuestion} disabled={isReadOnly || isSavingScores}>
                      {isSavingScores ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      Salva Punteggi
                    </Button>
                    <Button onClick={nextQuestion} className="flex-1 bg-accent text-accent-foreground" disabled={!hasScoresSavedForCurrentQ || isReadOnly}>
                      {quiz.currentQuestionIndex < quiz.questions.length - 1 ? "Prossima Domanda" : "Termina Quiz"}
                      <SkipForward className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            </Card>
          </div>
        );
      case "results":
        return (
            <Card className="text-center p-6 space-y-6">
                <CardTitle className="text-3xl font-headline">Classifica Finale 🏆</CardTitle>
                <div className="space-y-3">
                  {[...participants].sort((a,b) => b.score - a.score).map((p, i) => (
                      <div key={p.id} className={cn("flex justify-between p-4 border rounded-lg", i === 0 ? "bg-yellow-50 border-yellow-200" : "bg-card")}>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg">{i + 1}.</span>
                          <img src={p.avatar} className="w-10 h-10 rounded-full" alt={p.name} />
                          <span className="font-bold">{p.name}</span>
                        </div>
                        <span className="font-mono font-bold text-xl">{p.score} pti</span>
                      </div>
                  ))}
                </div>
                <Button onClick={resetQuiz} className="w-full" size="lg" disabled={isReadOnly}>Nuovo Quiz</Button>
            </Card>
        );
      default: return <div className="flex h-full items-center justify-center text-muted-foreground">Stato quiz sconosciuto.</div>;
    }
  };

  return (
    <SidebarProvider>
      <div className="h-screen flex flex-col w-full bg-background">
        <header className="flex h-14 items-center gap-4 border-b bg-card px-4 sticky top-0 z-50">
            <SidebarTrigger className="md:hidden"/>
            <span className="font-headline text-xl text-primary font-bold">MaestroDiQuiz</span>
            <div className="ml-auto flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-4 border-r pr-4">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <Label className="text-xs">Jolly</Label>
                      <Switch checked={settings?.jollyEnabled} onCheckedChange={toggleJollyFunction} disabled={isReadOnly}/>
                    </div>
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-primary" />
                      <Label className="text-xs">Classifica</Label>
                      <Switch checked={settings?.leaderboardEnabled} onCheckedChange={toggleLeaderboardVisibility} disabled={isReadOnly}/>
                    </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => auth.signOut()}><LogOut size={20} /></Button>
            </div>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <Sidebar>
            <SidebarContent>
              <ParticipantsSidebar participants={participants} leaderboard={leaderboard || []} onResetLeaderboard={() => {}} isReadOnly={isReadOnly} />
              <MediaGallerySidebar mediaItems={mediaGallery || []} onDeleteMedia={deleteMedia} isReadOnly={isReadOnly} />
            </SidebarContent>
          </Sidebar>
          <SidebarInset className="p-6 overflow-auto bg-background/50">{renderContent()}</SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
