'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
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
import { Loader2 } from 'lucide-react';
import { GoogleIcon } from '@/components/icons/google-icon';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // After a successful login, the useHost hook on the main page will determine if the user is a host.
      // We redirect them to the main page, and it will handle the rest.
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
      setError('Accesso con Google fallito. Riprova.');
      console.error("Google sign-in error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getFriendlyAuthErrorMessage = (errorCode: string) => {
    switch (errorCode) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Email o password non corretti. Riprova.';
      case 'auth/invalid-email':
        return 'L\'indirizzo email non è valido.';
      case 'auth/email-already-in-use':
        return 'Email già in uso, ma la password non è corretta.';
      default:
        return 'Si è verificato un errore durante l\'accesso. Riprova.';
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>
            Inserisci le tue credenziali per accedere al quiz.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
            <CardContent className="grid gap-4">
            {error && (
                <Alert variant="destructive">
                <AlertTitle>Errore di Accesso</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
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
                <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                />
            </div>
            </CardContent>
            <CardFooter className="flex-col items-start gap-4">
                <Button className="w-full" type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Accedi
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
                   <GoogleIcon className="mr-2 h-5 w-5" /> Accedi con Google
                </Button>
                 <div className="w-full text-center text-xs text-muted-foreground space-y-2">
                    <p>
                        Non hai un account?{' '}
                        <Link href="/register" className="underline underline-offset-2 hover:text-primary">
                        Registrati
                        </Link>
                    </p>
                </div>
            </CardFooter>
        </form>
      </Card>
    </div>
  );
}
