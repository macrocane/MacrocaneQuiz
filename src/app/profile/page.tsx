'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { UserProfile } from '@/lib/types';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const avatarChoices = PlaceHolderImages.filter(img => img.id.startsWith('avatar'));

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const userDocRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const [selectedAvatar, setSelectedAvatar] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setSelectedAvatar(profile.icon);
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!user || !userDocRef) return;
    setIsSaving(true);

    try {
      await updateDoc(userDocRef, {
        icon: selectedAvatar
      });
      toast({
        title: "Profilo Aggiornato",
        description: "Il tuo avatar è stato salvato correttamente.",
      });
      router.push('/');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore di Salvataggio",
        description: "Impossibile aggiornare l'avatar. Riprova più tardi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isUserLoading || isProfileLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background">
        <p>Devi essere loggato per vedere questa pagina.</p>
        <Button onClick={() => router.push('/login')}>Vai al Login</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-5 w-5" />
            </Button>
            <CardTitle className="text-2xl">Il mio Profilo</CardTitle>
          </div>
          <CardDescription>
            Gestisci la tua identità visiva nel quiz. Nickname ed email non sono modificabili.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Nickname</Label>
            <div className="p-3 rounded-md bg-muted font-medium border">
              {profile.nickname}
            </div>
          </div>
          
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Email</Label>
            <div className="p-3 rounded-md bg-muted text-sm border">
              {profile.email}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Cambia il tuo avatar</Label>
            <div className="flex flex-wrap gap-2 justify-center max-h-[300px] overflow-y-auto p-2 border rounded-md">
              {avatarChoices.map((avatar) => (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => setSelectedAvatar(avatar.imageUrl)}
                  className={cn(
                    "rounded-full ring-offset-background transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                    selectedAvatar === avatar.imageUrl ? "ring-2 ring-primary scale-110" : "opacity-70 hover:opacity-100"
                  )}
                >
                  <Image
                    src={avatar.imageUrl}
                    alt={avatar.description}
                    width={56}
                    height={56}
                    className="w-14 h-14 rounded-full object-cover border-2 border-transparent"
                  />
                </button>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button className="w-full" onClick={handleSaveProfile} disabled={isSaving || selectedAvatar === profile.icon}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salva Avatar
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => router.back()}>
            Annulla
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
