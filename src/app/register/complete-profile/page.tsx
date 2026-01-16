'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useUser, useFirestore } from '@/firebase';
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
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { UserProfile } from '@/lib/types';
import { Loader2 } from 'lucide-react';

const avatarChoices = PlaceHolderImages.filter(img => img.id.startsWith('avatar'));

export default function CompleteProfilePage() {
  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>(avatarChoices[0].imageUrl);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading) {
      if (!user) {
        // Not logged in, shouldn't be here
        router.push('/login');
        return;
      }
      
      // Check if profile already exists
      const checkProfile = async () => {
        const userDocRef = doc(firestore, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          // Profile already complete, redirect away
          router.push('/');
        } else {
          // Set default nickname from Google account if available
          setNickname(user.displayName || user.email?.split('@')[0] || '');
        }
      };
      checkProfile();
    }
  }, [user, isUserLoading, router, firestore]);
  

  const handleProfileCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
        setError("Per favore, inserisci un nickname.");
        return;
    }
    if (!user) {
        setError("Utente non trovato. Prova a fare di nuovo il login.");
        return;
    }
    setError('');
    setIsLoading(true);

    try {
      // Create user profile in Firestore
      const userProfile: UserProfile = {
        id: user.uid,
        email: user.email!,
        nickname: nickname,
        icon: selectedAvatar,
      };

      const userDocRef = doc(firestore, 'users', user.uid);
      await setDoc(userDocRef, userProfile);

      // Redirect to final destination
      const redirectPath = localStorage.getItem('redirectAfterLogin') || '/';
      localStorage.removeItem('redirectAfterLogin');
      router.push(redirectPath);

    } catch (error: any) {
      setError('Si è verificato un errore durante il salvataggio del profilo. Riprova.');
    } finally {
        setIsLoading(false);
    }
  };
  
  if (isUserLoading || !user) {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <span className="sr-only">Caricamento...</span>
        </div>
      );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Completa il tuo profilo</CardTitle>
          <CardDescription>
            Scegli il tuo nome utente e avatar per finire la registrazione.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleProfileCompletion}>
            <CardContent className="grid gap-4">
            {error && (
                <Alert variant="destructive">
                <AlertTitle>Errore</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
             <div className="grid gap-2">
                <Label htmlFor="nickname">Nickname</Label>
                <Input
                    id="nickname"
                    type="text"
                    placeholder="Il tuo nome nel gioco"
                    required
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                />
            </div>

            <div className="space-y-2">
                <Label>Scegli il tuo avatar</Label>
                <div className="flex flex-wrap gap-2 justify-center">
                    {avatarChoices.map((avatar) => (
                    <button
                        key={avatar.id}
                        type="button"
                        onClick={() => setSelectedAvatar(avatar.imageUrl)}
                        className={cn(
                        "rounded-full ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        selectedAvatar === avatar.imageUrl ? "ring-2 ring-primary" : ""
                        )}
                    >
                        <Image
                            src={avatar.imageUrl}
                            alt={avatar.description}
                            width={64}
                            height={64}
                            className="w-16 h-16 rounded-full object-cover border-2 border-transparent"
                            data-ai-hint={avatar.imageHint}
                        />
                    </button>
                    ))}
                </div>
            </div>

            </CardContent>
            <CardFooter className="flex-col items-start gap-4">
                <Button className="w-full" type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salva e Continua
                </Button>
            </CardFooter>
        </form>
      </Card>
    </div>
  );
}
