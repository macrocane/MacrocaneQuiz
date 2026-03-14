'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
    if (profile) setSelectedAvatar(profile.icon);
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!user || !userDocRef) return;
    setIsSaving(true);
    try {
      await updateDoc(userDocRef, { icon: selectedAvatar });
      toast({ title: "Profilo Aggiornato" });
      router.push('/');
    } catch (error) {
      toast({ variant: "destructive", title: "Errore" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isUserLoading || isProfileLoading) return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>Il mio Profilo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Nickname</Label><div className="p-2 bg-muted rounded">{profile?.nickname}</div></div>
          <div className="grid grid-cols-4 gap-2">
            {avatarChoices.map((a) => (
                <button key={a.id} onClick={() => setSelectedAvatar(a.imageUrl)} className={cn("rounded-full border-2", selectedAvatar === a.imageUrl ? "border-primary" : "border-transparent")}>
                    <img src={a.imageUrl} className="w-full rounded-full" />
                </button>
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
            <Button onClick={handleSaveProfile} className="w-full" disabled={isSaving}><Save size={16} className="mr-2"/>Salva</Button>
            <Button variant="ghost" onClick={() => router.back()} className="w-full"><ArrowLeft size={16} className="mr-2"/>Annulla</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
