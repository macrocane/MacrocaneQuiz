

"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, doc, onSnapshot, setDoc, updateDoc, writeBatch, FirestoreError, getDocs } from 'firebase/firestore';
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
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";

import type { Question, Participant, Answer, Quiz, LeaderboardEntry, StoredMedia } from "@/lib/types";
import { detectCheating } from "@/ai/flows/detect-cheating";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth, useFirestore, useMemoFirebase, FirestorePermissionError, errorEmitter, useUser, useCollection } from '@/firebase';
import { setDocumentNonBlocking, updateDocumentNonBlocking, addDocumentNonBlocking } from '@/firebase/non-blocking-updates';

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import MediaGallerySidebar from "@/components/quiz/media-gallery-sidebar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


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

const MEDIA_GALLERY_KEY = 'quiz-media-gallery';
const QUIZ_DRAFT_KEY = 'quiz-draft';
const ACTIVE_QUIZ_ID_KEY = 'active-quiz-id';

interface HostDashboardProps {
  isReadOnly: boolean;
}

export default function HostDashboard({ isReadOnly }: HostDashboardProps) {
  const [quizId, setQuizId] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [inviteLink, setInviteLink] = useState("");
  const { toast } = useToast();
  
  const [mediaGallery, setMediaGallery] = useState<StoredMedia[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  

  const auth = useAuth();
  const { user } = useUser();
  const firestore = useFirestore();

  const quizDocRef = useMemoFirebase(() => quizId ? doc(firestore, "quizzes", quizId) : null, [firestore, quizId]);
  const participantsColRef = useMemoFirebase(() => quizId ? collection(firestore, `quizzes/${quizId}/participants`) : null, [firestore, quizId]);

  const rankingsColRef = useMemoFirebase(() => collection(firestore, 'monthly_rankings'), [firestore]);
  const { data: leaderboard } = useCollection<LeaderboardEntry>(rankingsColRef);

  const currentQuestion = quiz?.questions?.[quiz.currentQuestionIndex];

  useEffect(() => {
    // This effect runs once on mount to restore session OR initialize.
    try {
      const activeQuizId = localStorage.getItem(ACTIVE_QUIZ_ID_KEY);
      if (activeQuizId) {
        setQuizId(activeQuizId);
        // Don't set quiz, let the snapshot listener do it.
        return;
      }

      const draftJson = localStorage.getItem(QUIZ_DRAFT_KEY);
      if (draftJson) {
        const draftQuiz = JSON.parse(draftJson) as Quiz;
        if (draftQuiz && draftQuiz.state === 'creating') {
          setQuiz(draftQuiz);
          return; // Restored from draft
        }
      }

      // If we reach here, there's no active quiz and no draft, so we initialize a new one.
      setQuiz({
        id: '',
        name: "Il Mio Quiz Fantastico",
        hostId: '', // Will be set by the next effect
        state: "creating",
        questions: [],
        currentQuestionIndex: 0,
        answers: [],
        participants: [],
      });
    } catch (error) {
      console.error("Error restoring/initializing session from localStorage:", error);
      localStorage.removeItem(ACTIVE_QUIZ_ID_KEY);
      localStorage.removeItem(QUIZ_DRAFT_KEY);
    }
  }, []); // The empty dependency array ensures this runs only once on mount.

  // Effect to update hostId in draft when user loads
  useEffect(() => {
    if (user && quiz?.state === 'creating' && quiz.hostId !== user.uid) {
        setQuiz(prev => prev ? { ...prev, hostId: user.uid } : null);
    }
  }, [user, quiz]);

  // Effect to persist quiz state to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (quizId && quiz?.state !== 'creating') {
        localStorage.setItem(ACTIVE_QUIZ_ID_KEY, quizId);
        localStorage.removeItem(QUIZ_DRAFT_KEY);
      } else if (quiz?.state === 'creating') {
        // Condition to avoid saving empty draft on init
        if (quiz.questions.length > 0 || quiz.name !== "Il Mio Quiz Fantastico") {
          localStorage.setItem(QUIZ_DRAFT_KEY, JSON.stringify(quiz));
        }
      }
    } catch (error) {
      console.error("Error saving session to localStorage:", error);
    }
  }, [quiz, quizId]);
  
  useEffect(() => {
    if (!quizDocRef) {
      // We are in "creating" mode, state is handled by other effects.
      return;
    }

    const unsubscribe = onSnapshot(quizDocRef, (doc) => {
      if (doc.exists()) {
        const quizData = doc.data() as Quiz;
        setQuiz(quizData);
      } else {
        // Quiz was deleted on the backend, so reset the view
        toast({
            variant: "destructive",
            title: "Quiz non trovato",
            description: "Il quiz a cui eri connesso non esiste più. Ritorno alla creazione.",
        });
        resetQuiz();
      }
    },
    (err: FirestoreError) => {
      console.error("Error listening to quiz document:", err);
      if (quizDocRef) {
          const contextualError = new FirestorePermissionError({
            operation: 'get',
            path: quizDocRef.path,
          });
          errorEmitter.emit('permission-error', contextualError);
      }
    });

    return () => unsubscribe();
  }, [quizDocRef]);


  useEffect(() => {
    if (!participantsColRef) {
      setParticipants([]);
      return;
    }
    const unsubscribe = onSnapshot(participantsColRef, (snapshot) => {
      setParticipants(snapshot.docs.map(doc => doc.data() as Participant));
    }, (err: FirestoreError) => {
      console.error("Error listening to participants collection:", err);
      if (participantsColRef) {
          const contextualError = new FirestorePermissionError({
            operation: 'list',
            path: participantsColRef.path,
          });
          errorEmitter.emit('permission-error', contextualError);
      }
    });
    return () => unsubscribe();
  }, [participantsColRef]);


 useEffect(() => {
    if (!quizId || !quiz?.questions.length) {
        setQuiz(prev => prev ? ({ ...prev, answers: [] }) : null);
        return;
    }

    const answersColRef = collection(firestore, `quizzes/${quizId}/questions`);
    const unsubscribers = quiz.questions.map(q => {
        const questionAnswersColRef = collection(answersColRef, `${q.id}/answers`);
        return onSnapshot(questionAnswersColRef, (snapshot) => {
            const newAnswersForQuestion = snapshot.docs.map(doc => doc.data() as Answer);
            
            setQuiz(prevQuiz => {
                if (!prevQuiz) return null;
                const existingAnswers = prevQuiz.answers || [];
                const otherAnswers = existingAnswers.filter(ans => ans.questionId !== q.id);
                const updatedAnswers = [...otherAnswers, ...newAnswersForQuestion];

                // Cheat detection for new answers
                newAnswersForQuestion.forEach(ans => {
                    const alreadyProcessed = existingAnswers.some(a => a.participantId === ans.participantId && a.questionId === ans.questionId);
                    if (!alreadyProcessed) {
                        handleNewAnswer(ans);
                    }
                });

                return { ...prevQuiz, answers: updatedAnswers };
            });

        }, (err: FirestoreError) => {
            console.error(`Error listening to answers for question ${q.id}:`, err);
            const contextualError = new FirestorePermissionError({
                operation: 'list',
                path: questionAnswersColRef.path,
            });
            errorEmitter.emit('permission-error', contextualError);
        });
    });

    return () => unsubscribers.forEach(unsub => unsub());
}, [quizId, quiz?.questions, firestore]);



  useEffect(() => {
    try {
        const storedMedia = localStorage.getItem(MEDIA_GALLERY_KEY);
        if (storedMedia) {
            setMediaGallery(JSON.parse(storedMedia));
        }
    } catch (error) {
        console.error("Could not load data from localStorage", error);
    }
  }, []);

  const updateLeaderboard = async (quizResults: Participant[]) => {
    if (isReadOnly) return;

    const rankingsSnapshot = await getDocs(rankingsColRef);
    const currentRankings: LeaderboardEntry[] = rankingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
    const batch = writeBatch(firestore);

    quizResults.forEach(participant => {
        const existingEntry = currentRankings.find(entry => entry.name === participant.name);

        if (existingEntry && existingEntry.id) {
            const rankDocRef = doc(firestore, 'monthly_rankings', existingEntry.id);
            batch.update(rankDocRef, {
                monthlyScore: existingEntry.monthlyScore + participant.score
            });
        } else {
            const newRankDocRef = doc(collection(firestore, 'monthly_rankings'));
            batch.set(newRankDocRef, {
                name: participant.name,
                monthlyScore: participant.score,
                avatar: participant.avatar,
                // rank will be calculated client side for display
            });
        }
    });

    await batch.commit();
  };

  const resetLeaderboard = async () => {
    if (isReadOnly) return;
    
    const rankingsSnapshot = await getDocs(rankingsColRef);
    if (rankingsSnapshot.empty) return;
    
    const batch = writeBatch(firestore);
    rankingsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    
    await batch.commit();
    toast({
        title: "Classifica Azzerata!",
        description: "La classifica è stata svuotata con successo.",
    });
  };

  const handleFileUpload = (file: File) => {
    if (isReadOnly) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const newMedia: StoredMedia = {
            id: uuidv4(),
            name: file.name,
            type: file.type,
            url: dataUrl,
            createdAt: new Date().toISOString()
        };
        
        setMediaGallery(prev => {
            const updatedGallery = [...prev, newMedia];
            try {
                localStorage.setItem(MEDIA_GALLERY_KEY, JSON.stringify(updatedGallery));
            } catch (error) {
                console.error("Could not save media to localStorage", error);
                toast({
                    variant: "destructive",
                    title: "Errore di Salvataggio",
                    description: "Spazio di archiviazione locale insufficiente per salvare il file.",
                });
                return prev;
            }
            form.setValue('mediaUrl', dataUrl);
            return updatedGallery;
        });
    };
    reader.onerror = () => {
        toast({
            variant: "destructive",
            title: "Errore di Lettura File",
            description: "Impossibile leggere il file selezionato.",
        });
    }
    reader.readAsDataURL(file);
  }

  const deleteMedia = (id: string) => {
    if (isReadOnly) return;
    setMediaGallery(prev => {
        const updatedGallery = prev.filter(media => media.id !== id);
        try {
            localStorage.setItem(MEDIA_GALLERY_KEY, JSON.stringify(updatedGallery));
             toast({
                title: "Media Eliminato",
                description: "Il file è stato rimosso dalla galleria.",
            });
        } catch (error) {
            console.error("Could not update media gallery in localStorage", error);
        }
        return updatedGallery;
    });
  };


  const form = useForm<z.infer<typeof questionSchema>>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      text: "",
      type: "multiple-choice",
      options: [{ value: "" }, { value: "" }, { value: "" }, { value: "" }],
      correctAnswer: "0",
      answerType: 'multiple-choice',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "options",
  });

  const questionType = form.watch("type");
  const answerType = form.watch("answerType");


  const handleNewAnswer = async (answer: Answer) => {
    if (!quiz || !currentQuestion || isReadOnly) return;

    if (quiz.answers?.some(a => a.participantId === answer.participantId && a.questionId === currentQuestion.id)) {
      return;
    }

    const { isCheating, reason } = await detectCheating({
      responseTime: answer.responseTime,
      answerText: answer.answerText,
      questionText: currentQuestion.text,
    });
    
    const participant = participants.find(p => p.id === answer.participantId);

    if (isCheating && participant) {
      toast({
        variant: "destructive",
        title: "Potenziale Tentativo di Barare Rilevato!",
        description: `Potrebbe essere che ${participant.name} stia barando. Motivo: ${reason}`,
      });
    }
  };

  const onSubmit = (data: z.infer<typeof questionSchema>) => {
    if (!quiz || isReadOnly) return;
    
    let correctAnswerValue: string | null = null;
    const isMultipleChoice = data.type === 'multiple-choice' || (['image','video','audio'].includes(data.type) && data.answerType === 'multiple-choice');
    const isOpenEnded = data.type === 'open-ended' || (['image','video','audio'].includes(data.type) && data.answerType === 'open-ended');

    if (isMultipleChoice && data.correctAnswer) {
        correctAnswerValue = data.options?.[parseInt(data.correctAnswer!)]?.value || null;
    } else if (isOpenEnded) {
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
    
    // Reset form while keeping the current type
    const currentType = form.getValues('type');
    const currentAnswerType = form.getValues('answerType');

    let defaultOptions: {value: string}[] = [];
    let defaultCorrectAnswer: string | undefined = undefined;

    if (currentType === 'multiple-choice' || (['image', 'video', 'audio'].includes(currentType) && currentAnswerType === 'multiple-choice')) {
      defaultOptions = [{ value: "" }, { value: "" }, { value: "" }, { value: "" }];
      defaultCorrectAnswer = "0";
    } else if (currentType === 'reorder') {
      defaultOptions = [{ value: "" }, { value: "" }, { value: "" }, { value: "" }];
    } else {
       defaultCorrectAnswer = '';
    }

    form.reset({
      text: "",
      type: currentType,
      answerType: currentAnswerType,
      mediaUrl: '',
      options: defaultOptions,
      correctAnswer: defaultCorrectAnswer,
    });
  };

  const deleteQuestion = (id: string) => {
     if (isReadOnly) return;
     setQuiz(prev => prev ? ({ ...prev, questions: prev.questions.filter((q) => q.id !== id) }) : null);
  };
  
  const handleScoreChange = (participantId: string, questionId: string, value: string) => {
    if (!quizDocRef || isReadOnly || !quizId || !quiz) return;
    
    let newScore = parseInt(value, 10);
    if (isNaN(newScore)) {
        // If the input is cleared or invalid, treat it as 0 to avoid Firestore errors
        newScore = 0;
    }

    const answerToUpdate = quiz.answers?.find(ans => ans.participantId === participantId && ans.questionId === questionId);
    if(answerToUpdate) {
        const answerDocRef = doc(firestore, `quizzes/${quizId}/questions/${questionId}/answers`, answerToUpdate.participantId);
        // Only update if score is different to avoid unnecessary writes.
        if (answerToUpdate.score !== newScore) {
          updateDocumentNonBlocking(answerDocRef, { score: newScore });
        }
    }
  };

  const startQuiz = () => {
    if (!quiz || isReadOnly || !user) return;
    const newQuizId = uuidv4().slice(0, 8);
    const newQuizState: Quiz = { ...quiz, id: newQuizId, hostId: user.uid, state: "lobby" };
    
    setQuizId(newQuizId);
    setInviteLink(`${window.location.origin}/join/${newQuizId}`);
    
    const newQuizDocRef = doc(firestore, "quizzes", newQuizId);
    setDocumentNonBlocking(newQuizDocRef, newQuizState, { merge: true });
  };

  const beginQuiz = () => {
    if (!quizDocRef || isReadOnly) return;
    updateDocumentNonBlocking(quizDocRef, {
        state: "live",
        currentQuestionIndex: 0,
    });
  };

  const showQuestionResults = () => {
    if (!quizDocRef || isReadOnly) return;
    updateDocumentNonBlocking(quizDocRef, { state: "question-results" });
  }

  const nextQuestion = async () => {
    if (!quiz || !quiz.questions || !quizDocRef || isReadOnly || !quizId || !participantsColRef) return;
  
    // 1. Finalize and commit scores for the current question
    if ((quiz.state === 'live' || quiz.state === 'question-results') && currentQuestion) {
      const batch = writeBatch(firestore);
      const currentParticipantsState = [...participants]; // Create a stable copy for this operation
      
      currentParticipantsState.forEach(p => {
        const participantAnswer = quiz.answers?.find(a => a.participantId === p.id && a.questionId === currentQuestion.id);
        // If an answer exists, calculate its score. The base score is the participant's score before this question.
        const scoreForThisQuestion = participantAnswer?.score ?? 0;
        const newTotalScore = p.score + scoreForThisQuestion;
  
        const participantRef = doc(firestore, `quizzes/${quizId}/participants`, p.id);
        batch.update(participantRef, { score: newTotalScore });
      });
      await batch.commit();
    }
  
    // 2. Decide if we move to the next question or end the quiz
    if (quiz.currentQuestionIndex < quiz.questions.length - 1) {
      // Go to the next question
      updateDocumentNonBlocking(quizDocRef, {
        state: "live",
        currentQuestionIndex: quiz.currentQuestionIndex + 1,
      });
    } else {
      // End the quiz
      // Read the final, committed scores to avoid race conditions
      const finalParticipantsSnapshot = await getDocs(participantsColRef);
      const finalParticipants = finalParticipantsSnapshot.docs.map(doc => doc.data() as Participant);
      
      // Pass this guaranteed-correct data to updateLeaderboard
      updateLeaderboard(finalParticipants);
      
      // Set the final quiz state
      updateDocumentNonBlocking(quizDocRef, {
        state: "results",
      });
    }
  };

  const resetQuiz = () => {
    if (isReadOnly || !user) return;
    setQuizId(null);
    setQuiz({
      id: '',
      name: "Il Mio Quiz Fantastico",
      hostId: user?.uid || '',
      state: "creating",
      questions: [],
      currentQuestionIndex: 0,
      answers: [],
      participants: [],
    });
    setParticipants([]);
    try {
      localStorage.removeItem(ACTIVE_QUIZ_ID_KEY);
      localStorage.removeItem(QUIZ_DRAFT_KEY);
    } catch (error) {
        console.error("Error clearing session from localStorage:", error);
    }
  };

  const restartQuiz = () => {
     if (!quizDocRef || !quiz || isReadOnly || !quizId) return;

      const batch = writeBatch(firestore);
      participants.forEach(p => {
        const participantRef = doc(firestore, `quizzes/${quizId}/participants`, p.id);
        batch.update(participantRef, { score: 0 });
      });
      batch.commit();

     updateDocumentNonBlocking(quizDocRef, {
        state: "live",
        currentQuestionIndex: 0,
     });
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    toast({ title: "Copiato negli appunti!", description: "Il link d'invito è stato copiato." });
  };
  
  const getQuestionTypeLabel = (question: Question) => {
    switch (question.type) {
        case 'multiple-choice': return 'Scelta Multipla';
        case 'open-ended': return 'Risposta Aperta';
        case 'image': return `Immagine (${question.answerType === 'multiple-choice' ? 'Scelta Multipla' : 'Risposta Aperta'})`;
        case 'video': return `Video (${question.answerType === 'multiple-choice' ? 'Scelta Multipla' : 'Risposta Aperta'})`;
        case 'audio': return `Audio (${question.answerType === 'multiple-choice' ? 'Scelta Multipla' : 'Risposta Aperta'})`;
        case 'reorder': return 'Riordina';
        default: return '';
    }
  }

  if (!quiz) {
    return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  const currentAnswers = quiz.answers?.filter(a => a.questionId === currentQuestion?.id) || [];


  const renderContent = () => {
    switch (quiz.state) {
      case "creating":
        const showOptions = questionType === "multiple-choice" || (['image', 'video', 'audio'].includes(questionType) && answerType === 'multiple-choice');
        const showReorderOptions = questionType === 'reorder';
        const showOpenEndedCorrectAnswer = questionType === 'open-ended' || (['image', 'video', 'audio'].includes(questionType) && answerType === 'open-ended');

        return (
          <div className="space-y-6">
            {isReadOnly && (
                <Alert variant="default" className="bg-yellow-50 border-yellow-200 text-yellow-800">
                    <AlertTriangle className="h-4 w-4 !text-yellow-800" />
                    <AlertTitle>Modalità Sola Lettura</AlertTitle>
                    <AlertDescription>
                        Stai visualizzando come Co-Host. Non puoi modificare il quiz.
                    </AlertDescription>
                </Alert>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2">
                  <Pencil size={24} /> Dettagli del Quiz
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                    <Label htmlFor="quiz-name">Nome del Quiz</Label>
                    <Input
                        id="quiz-name"
                        value={quiz.name}
                        onChange={(e) => setQuiz(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
                        placeholder="Es. Quiz di Cultura Generale"
                        disabled={isReadOnly}
                    />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2">
                  <ClipboardPlus size={24} /> Crea una Nuova Domanda
                </CardTitle>
                <CardDescription>
                  Aggiungi domande al tuo quiz. Puoi scegliere tra vari formati.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <fieldset disabled={isReadOnly}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Tipo di Domanda</FormLabel>
                                    <Select 
                                        onValueChange={(value) => {
                                            field.onChange(value);
                                            const newType = value as Question['type'];
                                            const currentAnswerType = form.getValues('answerType');
                                            
                                            let newOptions: {value: string}[] = [];
                                            let newCorrectAnswer: string | undefined = undefined;

                                            if (newType === 'multiple-choice' || (['image', 'video', 'audio'].includes(newType) && currentAnswerType === 'multiple-choice')) {
                                                newOptions = [{ value: "" }, { value: "" }, { value: "" }, { value: "" }];
                                                newCorrectAnswer = "0";
                                            } else if (newType === 'reorder') {
                                                newOptions = [{ value: "" }, { value: "" }, { value: "" }, { value: "" }];
                                            }

                                            form.setValue('options', newOptions);
                                            form.setValue('correctAnswer', newCorrectAnswer);

                                            if (!['image', 'video', 'audio'].includes(newType)) {
                                                form.setValue('answerType', undefined);
                                            } else {
                                                form.setValue('answerType', 'multiple-choice');
                                            }
                                        }} 
                                        defaultValue={field.value} 
                                        disabled={isReadOnly}
                                    >
                                        <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleziona un tipo di domanda" />
                                        </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="multiple-choice">Scelta Multipla</SelectItem>
                                            <SelectItem value="open-ended">Risposta Aperta</SelectItem>
                                            <SelectItem value="image">Basata su Immagine</SelectItem>
                                            <SelectItem value="video">Basata su Video</SelectItem>
                                            <SelectItem value="audio">Basata su Audio</SelectItem>
                                            <SelectItem value="reorder">Riordina le risposte</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {['image', 'video', 'audio'].includes(questionType) && (
                                <FormField
                                control={form.control}
                                name="answerType"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Tipo di Risposta</FormLabel>
                                    <Select 
                                        onValueChange={(value) => {
                                            field.onChange(value);
                                            const newAnswerType = value as 'multiple-choice' | 'open-ended';
                                            if (newAnswerType === 'multiple-choice') {
                                                form.setValue('options', [{ value: "" }, { value: "" }, { value: "" }, { value: "" }]);
                                                form.setValue('correctAnswer', "0");
                                            } else {
                                                form.setValue('options', []);
                                                form.setValue('correctAnswer', ''); // Reset to empty string for open-ended
                                            }
                                        }} 
                                        defaultValue={field.value} 
                                        disabled={isReadOnly}
                                    >
                                        <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleziona un tipo di risposta" />
                                        </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                        <SelectItem value="multiple-choice">Scelta Multipla</SelectItem>
                                        <SelectItem value="open-ended">Risposta Aperta</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                    </FormItem>
                                )}
                                />
                            )}
                        </div>
                        
                        <FormField
                        control={form.control}
                        name="text"
                        render={({ field }) => (
                            <FormItem className="mt-6">
                            <FormLabel>Testo della Domanda</FormLabel>
                            <FormControl>
                                <Textarea placeholder="es. Qual è la capitale della Francia?" {...field} disabled={isReadOnly} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />

                        {['image', 'video', 'audio'].includes(questionType) && (
                            <FormItem className="mt-6">
                                <FormLabel>File Multimediale</FormLabel>
                                <FormControl>
                                    <div>
                                        <Input 
                                            id="media-upload"
                                            type="file"
                                            accept="image/*,video/*,audio/*"
                                            className="sr-only"
                                            onChange={(e) => {
                                                if (e.target.files && e.target.files[0]) {
                                                    handleFileUpload(e.target.files[0]);
                                                }
                                            }}
                                            disabled={isReadOnly}
                                        />
                                        <Label htmlFor="media-upload" className={cn("w-full", isReadOnly ? "cursor-not-allowed" : "")}>
                                            <div className={cn("flex items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-muted-foreground/50", isReadOnly ? "bg-muted/50" : "cursor-pointer hover:bg-muted")}>
                                                <Upload className="h-5 w-5 text-muted-foreground"/>
                                                <span className="text-muted-foreground">Fai clic per caricare un file</span>
                                            </div>
                                        </Label>
                                        {form.getValues('mediaUrl') && (
                                            <div className="mt-2 text-sm text-muted-foreground">
                                                File selezionato! Puoi vederlo nella galleria.
                                            </div>
                                        )}
                                    </div>
                                </FormControl>
                                <FormDescription>
                                    Carica un'immagine, video o file audio per la tua domanda.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}

                        {showOptions && (
                        <FormField
                            control={form.control}
                            name="correctAnswer"
                            render={({ field }) => (
                            <FormItem className="space-y-3 mt-6">
                                <FormLabel>Opzioni (seleziona la risposta corretta)</FormLabel>
                                <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="space-y-2"
                                disabled={isReadOnly}
                                >
                                {fields.map((item, index) => (
                                    <FormField
                                    key={item.id}
                                    control={form.control}
                                    name={`options.${index}.value`}
                                    render={({ field: optionField }) => (
                                        <FormItem className="flex items-center gap-2">
                                        <FormControl>
                                            <RadioGroupItem value={index.toString()} id={`options.${index}`} disabled={isReadOnly} />
                                        </FormControl>
                                        <Input placeholder={`Opzione ${index + 1}`} {...optionField} disabled={isReadOnly} />
                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={isReadOnly}>
                                            <Trash2 className="h-4 w-4"/>
                                        </Button>
                                        </FormItem>
                                    )}
                                    />
                                ))}
                                </RadioGroup>
                                <Button type="button" variant="outline" size="sm" onClick={() => append({ value: "" })} disabled={isReadOnly}>
                                    Aggiungi opzione
                                </Button>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        )}

                        {showReorderOptions && (
                            <div className="space-y-3 mt-6">
                                <FormLabel>Opzioni da riordinare (nell'ordine corretto)</FormLabel>
                                <div className="space-y-2">
                                {fields.map((item, index) => (
                                    <FormField
                                    key={item.id}
                                    control={form.control}
                                    name={`options.${index}.value`}
                                    render={({ field }) => (
                                        <FormItem className="flex items-center gap-2">
                                        <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab"/>
                                        <FormControl>
                                            <Input placeholder={`Elemento ${index + 1}`} {...field} disabled={isReadOnly} />
                                        </FormControl>
                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={isReadOnly}>
                                            <Trash2 className="h-4 w-4"/>
                                        </Button>
                                        </FormItem>
                                    )}
                                    />
                                ))}
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={() => append({ value: "" })} disabled={isReadOnly}>
                                    Aggiungi opzione
                                </Button>
                                <FormDescription>
                                    L'ordine in cui li lasci sarà considerato quello corretto.
                                </FormDescription>
                            </div>
                        )}
                        
                        {showOpenEndedCorrectAnswer && (
                             <FormField
                                control={form.control}
                                name="correctAnswer"
                                render={({ field }) => (
                                    <FormItem className="mt-6">
                                    <FormLabel>Risposta corretta (opzionale)</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Inserisci la risposta di riferimento" {...field} disabled={isReadOnly} />
                                    </FormControl>
                                     <FormDescription>
                                        Questa risposta verrà mostrata ai partecipanti dopo la domanda.
                                    </FormDescription>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <Button type="submit" variant="secondary" className="mt-6" disabled={isReadOnly}>Aggiungi Domanda</Button>
                    </fieldset>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {quiz.questions && quiz.questions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-headline flex items-center gap-2"><ListChecks size={24}/> Domande del Quiz</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {quiz.questions.map((q, i) => (
                    <div key={q.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <p className="font-medium">{i + 1}. {q.text}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{getQuestionTypeLabel(q)}</Badge>
                        <Button variant="ghost" size="icon" onClick={() => deleteQuestion(q.id)} disabled={isReadOnly}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
                <CardFooter>
                  <Button onClick={startQuiz} className="w-full" size="lg" style={{background: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))'}} disabled={quiz.questions.length === 0 || isReadOnly}>
                    Crea Lobby del Quiz <ArrowRight className="ml-2" />
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        );
      case "lobby":
        return (
          <Card className="text-center">
            <CardHeader>
              <CardTitle className="font-headline text-3xl">Lobby del Quiz</CardTitle>
              <CardDescription>Condividi il link qui sotto per invitare i partecipanti. Il quiz inizierà quando sarai pronto.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-center gap-2 p-4 rounded-lg bg-muted border border-dashed">
                <LinkIcon className="h-5 w-5 text-muted-foreground"/>
                <span className="text-lg font-mono tracking-wider">{inviteLink}</span>
                <Button variant="ghost" size="icon" onClick={copyToClipboard}><Copy className="h-5 w-5"/></Button>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Partecipanti ({participants.length})</h3>
                <div className="flex justify-center gap-4 flex-wrap">
                   {participants.length > 0 ? participants.map(p => (
                    <div key={p.id} className="flex flex-col items-center gap-1">
                      <img src={p.avatar} alt={p.name} className="w-12 h-12 rounded-full"/>
                      <span className="text-sm font-medium">{p.name}</span>
                    </div>
                  )) : (
                      <p className="text-sm text-muted-foreground">In attesa che i partecipanti si uniscano...</p>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-2">
               <Button onClick={resetQuiz} variant="outline" className="w-full sm:w-auto" disabled={isReadOnly}>
                <Home className="mr-2 h-4 w-4" />
                Home
              </Button>
              <Button onClick={beginQuiz} className="w-full" size="lg" disabled={participants.length === 0 || isReadOnly}>
                Inizia il Quiz per {participants.length} partecipanti <Play className="ml-2"/>
              </Button>
            </CardFooter>
          </Card>
        );
      case "live":
      case "question-results":
        if (!quiz.questions) return null;
        const progress = ((quiz.currentQuestionIndex + 1) / quiz.questions.length) * 100;
        const needsMultipleChoice = currentQuestion.type === 'multiple-choice' || (['image', 'video', 'audio'].includes(currentQuestion.type) && currentQuestion.answerType === 'multiple-choice');
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="font-headline text-3xl mb-2">{currentQuestion.text}</CardTitle>
                    <CardDescription>{getQuestionTypeLabel(currentQuestion)}</CardDescription>
                  </div>
                  <Badge variant="secondary" className="text-lg">
                    Domanda {quiz.currentQuestionIndex + 1} / {quiz.questions.length}
                  </Badge>
                </div>
              </CardHeader>
               <CardContent className="space-y-4">
                {currentQuestion.mediaUrl && ['image', 'video', 'audio'].includes(currentQuestion.type) && (
                    <div className="w-full max-w-md mx-auto aspect-video relative bg-muted rounded-lg">
                        {currentQuestion.type === 'image' && <img src={currentQuestion.mediaUrl} alt="Contenuto della domanda" className="rounded-lg object-contain w-full h-full" />}
                        {currentQuestion.type === 'video' && <video src={currentQuestion.mediaUrl} controls className="rounded-lg object-contain w-full h-full" />}
                        {currentQuestion.type === 'audio' && <audio src={currentQuestion.mediaUrl} controls className="w-full p-4" />}
                    </div>
                )}
                {needsMultipleChoice && (
                  <div className="grid grid-cols-2 gap-4">
                    {currentQuestion.options?.map((opt, i) => (
                      <div key={i} className={cn(
                        "p-4 border rounded-lg text-center font-medium",
                        opt === currentQuestion.correctAnswer ? "bg-green-100 border-green-300 text-green-800" : "bg-background"
                      )}>
                        {opt}
                      </div>
                    ))}
                  </div>
                )}
                {currentQuestion.type === 'reorder' && (
                    <Alert>
                        <GripVertical className="h-4 w-4" />
                        <AlertTitle>Domanda di Riordino</AlertTitle>
                        <AlertDescription>
                            I partecipanti devono riordinare un elenco di elementi. Le risposte verranno mostrate di seguito. L'ordine corretto è: {currentQuestion.correctOrder?.join(', ')}
                        </AlertDescription>
                    </Alert>
                )}
              </CardContent>
               <CardFooter>
                <Progress value={progress} className="w-full" />
              </CardFooter>
            </Card>

             <Card>
              <CardHeader>
                <CardTitle className="font-headline">Risposte in Diretta ({currentAnswers.length}/{participants.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {participants.map(p => {
                  const answer = currentAnswers.find(a => a.participantId === p.id);
                  if (!answer) {
                    return (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                        <div className="flex items-center gap-3">
                          <img src={p.avatar} alt={p.name} className="w-8 h-8 rounded-full" />
                          <span className="font-medium">{p.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">In attesa di risposta...</span>
                      </div>
                    );
                  }
                  
                  return (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <img src={p.avatar} alt={p.name} className="w-8 h-8 rounded-full" />
                        <div>
                          <p className="font-medium">{p.name}</p>
                          {currentQuestion.type === 'reorder' ? (
                             <div>
                                <p className="text-sm text-muted-foreground">
                                    Ordine inviato: {answer.answerOrder?.join(', ')}
                                </p>
                                <p className="text-sm font-bold mt-1">
                                    Ordine corretto: {currentQuestion.correctOrder?.join(', ')}
                                </p>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">{answer.answerText}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {answer.isCheating && (
                           <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                               <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="h-3 w-3" /> Barando?
                               </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{answer.cheatingReason}</p>
                              </TooltipContent>
                            </Tooltip>
                           </TooltipProvider>
                        )}
                        <span className="text-sm font-mono">{answer.responseTime.toFixed(1)}s</span>
                         
                          <div className="flex items-center gap-1">
                            <Input 
                              type="number"
                              defaultValue={answer.score ?? 0}
                              onBlur={(e) => handleScoreChange(p.id, currentQuestion.id, e.target.value)}
                              className="w-20 h-8"
                              aria-label={`Punteggio per ${p.name}`}
                              disabled={quiz.state === 'question-results' || isReadOnly}
                            />
                            <span>pti</span>
                          </div>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
              <CardFooter className="flex-col sm:flex-row gap-2 justify-end">
                {currentAnswers.length < participants.length && quiz.state === 'live' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="w-full sm:w-auto" disabled={isReadOnly}>
                        Forza Prossima Domanda
                        <SkipForward className="ml-2" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Questo forzerà il passaggio alla domanda successiva per tutti i partecipanti, anche per quelli che non hanno ancora risposto.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={nextQuestion}>Continua</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                 {quiz.state === 'live' && (
                  <Button onClick={showQuestionResults} disabled={currentAnswers.length === 0 || isReadOnly}>
                    <Eye className="mr-2" />
                    Mostra Risposte
                  </Button>
                )}
                <Button onClick={nextQuestion} className="w-full sm:w-auto" size="lg" style={{background: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))'}} disabled={(quiz.state === 'live' && currentAnswers.length < participants.length) || isReadOnly}>
                  {quiz.currentQuestionIndex < quiz.questions.length - 1 ? "Prossima Domanda" : "Termina il Quiz"}
                  <ArrowRight className="ml-2"/>
                </Button>
              </CardFooter>
            </Card>
          </div>
        );
      case "results":
        const finalParticipants = participants.sort((a,b) => b.score - a.score);
        return (
          <Card className="text-center">
            <CardHeader>
              <CardTitle className="font-headline text-3xl">Quiz Terminato!</CardTitle>
              <CardDescription>Ecco i punteggi finali per questo round.</CardDescription>
            </CardHeader>
            <CardContent>
              {finalParticipants.map((p, i) => (
                 <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-lg w-6">{i+1}</span>
                      <img src={p.avatar} alt={p.name} className="w-10 h-10 rounded-full" />
                      <span className="font-medium">{p.name}</span>
                    </div>
                    <span className="text-lg font-bold">{p.score} pti</span>
                  </div>
              ))}
            </CardContent>
            <CardFooter className="flex-col sm:flex-row gap-2">
              <Button onClick={restartQuiz} variant="outline" className="w-full" disabled={isReadOnly}>Ricomincia il Quiz</Button>
              <Button onClick={resetQuiz} className="w-full" disabled={isReadOnly}>Nuovo Quiz</Button>
            </CardFooter>
          </Card>
        );
      default:
        return null;
    }
  };

  const getQuizStateLabel = () => {
    if (!quiz) return 'Caricamento...';
    switch(quiz.state) {
      case 'creating': return 'Creazione Quiz';
      case 'lobby': return `Lobby: ${quiz.name}`;
      case 'live': return `In Diretta: Domanda ${quiz.currentQuestionIndex + 1}`;
      case 'question-results': return `Risultati: Domanda ${quiz.currentQuestionIndex + 1}`;
      case 'results': return `Risultati: ${quiz.name}`;
    }
  }

  return (
    <SidebarProvider>
      <div className="h-screen flex flex-col">
        <header className="flex h-14 items-center gap-4 border-b bg-card px-4 lg:h-[60px] lg:px-6">
            <SidebarTrigger className="md:hidden"/>
            <div className="flex items-center gap-2 font-semibold">
                <LayoutGrid className="h-6 w-6 text-primary" />
                <span className="font-headline text-xl">MaestroDiQuiz</span>
            </div>
            <div className="ml-auto flex items-center gap-4">
                <h1 className="text-lg font-semibold md:text-2xl font-headline capitalize truncate">{getQuizStateLabel()}</h1>
                <Button variant="ghost" size="icon" onClick={() => auth.signOut()}>
                    <LogOut className="h-5 w-5" />
                    <span className="sr-only">Esci</span>
                </Button>
            </div>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <Sidebar>
            <SidebarHeader>
              <h2 className="text-lg font-semibold font-headline">Sessione</h2>
            </SidebarHeader>
            <SidebarContent>
              <ParticipantsSidebar 
                participants={participants} 
                leaderboard={leaderboard || []}
                onResetLeaderboard={resetLeaderboard}
                isReadOnly={isReadOnly}
                />
               <MediaGallerySidebar mediaItems={mediaGallery} onDeleteMedia={deleteMedia} isReadOnly={isReadOnly} />
            </SidebarContent>
          </Sidebar>
          <SidebarInset className="p-4 sm:p-6 overflow-auto">
            {renderContent()}
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}

    

    