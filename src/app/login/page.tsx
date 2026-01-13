'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { useAuth, useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
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
import type { Host } from '@/lib/types';


const specialUsers = {
    'host@quiz.com': 'password',
    'cohost1@quiz.com': 'password',
    'cohost2@quiz.com': 'password',
};

type SpecialUserEmail = keyof typeof specialUsers;

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

    const isSpecialUser = Object.keys(specialUsers).includes(email);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (isSpecialUser) {
        // Ensure host profile exists
        const hostDocRef = doc(firestore, 'hosts', user.uid);
        const hostProfile: Host = {
            id: user.uid,
            username: user.email!,
        };
        setDocumentNonBlocking(hostDocRef, hostProfile, { merge: true });
        router.push('/');
      } else {
        const redirectPath = localStorage.getItem('redirectAfterLogin') || '/';
        localStorage.removeItem('redirectAfterLogin');
        router.push(redirectPath);
      }
    } catch (error: any) {
        // If login fails, check if it's because a special user doesn't exist yet.
        if (isSpecialUser && password === specialUsers[email as SpecialUserEmail] && (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential')) {
            try {
                // Attempt to create the special user
                const specialUserCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = specialUserCredential.user;
                if (user) {
                    const hostProfile: Host = {
                        id: user.uid,
                        username: user.email!,
                    };
                    const hostDocRef = doc(firestore, 'hosts', user.uid);
                    // Using { merge: true } is safer, it creates or updates.
                    setDocumentNonBlocking(hostDocRef, hostProfile, { merge: true });

                    router.push('/'); // Redirect to host dashboard after creation
                }
            } catch (creationError: any) {
                 // If creation fails (e.g., email already exists but password was wrong), show generic error
                 setError(getFriendlyAuthErrorMessage(creationError.code));
            }
        } else {
            setError(getFriendlyAuthErrorMessage(error.code));
        }
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
            <CardFooter className="flex-col gap-4">
                <Button className="w-full" type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Accedi
                </Button>
                 <div className="text-xs text-center text-muted-foreground space-y-2">
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
