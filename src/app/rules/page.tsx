'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc } from 'firebase/firestore';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { useHost } from '@/hooks/use-host';
import { AppSettings } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, BookText, ArrowLeft, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function RulesPage() {
  const { user, isUserLoading } = useUser();
  const { isHost, isHostLoading } = useHost(user?.uid);
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(() => doc(firestore, 'settings', 'main'), [firestore]);
  const { data: settings, isLoading: isSettingsLoading } = useDoc<AppSettings>(settingsDocRef);

  const [rules, setRules] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setRules(settings.rules);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!isHost) return;
    setIsSaving(true);
    try {
      await setDoc(settingsDocRef, { rules }, { merge: true });
      toast({
        title: 'Regolamento Salvato',
        description: 'Le modifiche al regolamento sono state salvate con successo.',
      });
    } catch (error) {
      console.error("Error saving rules:", error);
      toast({
        variant: 'destructive',
        title: 'Errore di Salvataggio',
        description: 'Impossibile salvare il regolamento. Controlla le regole di Firestore.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = isUserLoading || isHostLoading || isSettingsLoading;
  const isReadOnly = !isHost;

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <span className="sr-only">Caricamento...</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 sm:p-6">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <div className="flex flex-col items-center gap-2 text-center">
            <BookText className="h-10 w-10 text-primary" />
            <CardTitle className="font-headline text-3xl">Regolamento del Quiz</CardTitle>
            <CardDescription>
              {isReadOnly
                ? 'Leggi le regole ufficiali del quiz.'
                : 'Modifica il regolamento che sarà visibile a tutti i partecipanti.'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isReadOnly ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none rounded-md border bg-muted p-4 whitespace-pre-wrap font-body"
              style={{ minHeight: '300px' }}
            >
              {rules || 'Il regolamento non è stato ancora scritto.'}
            </div>
          ) : (
              <Textarea
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                placeholder="Scrivi qui il regolamento..."
                rows={15}
                disabled={isReadOnly || isSaving}
              />
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-between gap-2">
           <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2" />
              Torna Indietro
            </Button>
          {!isReadOnly && (
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}
              Salva Regolamento
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
