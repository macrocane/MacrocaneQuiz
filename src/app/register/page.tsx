'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth, useFirestore } from '@/firebase';
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
import Link from 'next/link';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { UserProfile } from '@/lib/types';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { GoogleIcon } from '@/components/icons/google-icon';
import { ADMIN_ROLES } from '@/lib/roles';

const avatarChoices = PlaceHolderImages.filter(img => img.id.startsWith('avatar'));

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>(avatarChoices[0].imageUrl);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
        setError("Per favore, inserisci un nickname.");
        return;
    }
    setError('');
    setIsLoading(true);

    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Check if the user is an admin.
      if (user.email && ADMIN_ROLES.includes(user.email)) {
        // If they are an admin, no need to create a participant profile.
        // The logic on the main page will handle creating the host document.
        router.push('/');
        return; 
      }

      // 3. If not an admin, create user profile in Firestore
      const userProfile: UserProfile = {
        id: user.uid,
        email: user.email!,
        nickname: nickname,
        icon: selectedAvatar,
      };

      const userDocRef = doc(firestore, 'users', user.uid);
      await setDoc(userDocRef, userProfile);

      // 4. Redirect to login or directly to the app
      const redirectPath = localStorage.getItem('redirectAfterLogin') || '/';
      localStorage.removeItem('redirectAfterLogin');
      router.push(redirectPath);

    } catch (error: any) {
      setError(getFriendlyAuthErrorMessage(error.code));
    } finally {
        setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // If the user's email is in the admin roles, they are an admin. Redirect to home.
      if (user.email && ADMIN_ROLES.includes(user.email)) {
        router.push('/');
        return;
      }

      const userDocRef = doc(firestore, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        // New user, redirect to complete their profile
        router.push('/register/complete-profile');
      } else {
        // Existing user, proceed to redirect
        const redirectPath = localStorage.getItem('redirectAfterLogin') || '/';
        localStorage.removeItem('redirectAfterLogin');
        router.push(redirectPath);
      }
    } catch (error: any) {
      const friendlyMessage = getFriendlyGoogleAuthErrorMessage(error.code);
      setError(friendlyMessage);
      console.error("Google sign-in error:", error);
    } finally {
        setIsLoading(false);
    }
  };

   const getFriendlyAuthErrorMessage = (errorCode: string) => {
    switch (errorCode) {
      case 'auth/email-already-in-use':
        return 'Questo indirizzo email è già stato registrato.';
      case 'auth/weak-password':
        return 'La password è troppo debole. Deve contenere almeno 6 caratteri.';
      case 'auth/invalid-email':
        return 'L\'indirizzo email non è valido.';
      default:
        return 'Si è verificato un errore durante la registrazione. Riprova.';
    }
  };

  const getFriendlyGoogleAuthErrorMessage = (errorCode: string) => {
    switch (errorCode) {
      case 'auth/popup-closed-by-user':
        return 'Il pop-up di registrazione è stato chiuso prima del completamento. Riprova.';
      case 'auth/cancelled-popup-request':
        return 'Sono state effettuate troppe richieste di registrazione. Riprova più tardi.';
      case 'auth/popup-blocked':
        return 'Il pop-up è stato bloccato dal browser. Abilita i pop-up per questo sito e riprova.';
      case 'auth/unauthorized-domain':
        return 'Questo dominio non è autorizzato per l\'accesso con Google. Aggiungilo nella console di Firebase.';
      default:
        console.error(`Unhandled Google Auth Error: ${errorCode}`);
        return `Registrazione con Google fallita (codice: ${errorCode}). Controlla che il dominio sia autorizzato nella console di Firebase.`;
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Registrati</CardTitle>
          <CardDescription>
            Crea un account per partecipare ai quiz e salvare i tuoi punteggi.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
            <CardContent className="grid gap-4">
            {error && (
                <Alert variant="destructive">
                <AlertTitle>Errore di Registrazione</AlertTitle>
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
            <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                id="email"
                type="email"
                placeholder="mario@esempio.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                    <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute inset-y-0 right-0 flex items-center px-3"
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        {showPassword ? <EyeOff className="h-5 w-5"/> : <Eye className="h-5 w-5"/>}
                        <span className="sr-only">{showPassword ? 'Nascondi password' : 'Mostra password'}</span>
                    </Button>
                </div>
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
                    Crea Account
                </Button>
                 <div className="relative w-full">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">O continua con</span>
                  </div>
                </div>
                <Button variant="outline" className="w-full" type="button" onClick={handleGoogleSignIn} disabled={isLoading}>
                   <GoogleIcon className="mr-2 h-5 w-5" /> Registrati con Google
                </Button>
                <p className="w-full text-center text-xs text-muted-foreground">
                    Hai già un account?{' '}
                    <Link href="/login" className="underline underline-offset-2 hover:text-primary">
                    Accedi
                    </Link>
                </p>
            </CardFooter>
        </form>
      </Card>
    </div>
  );
}
