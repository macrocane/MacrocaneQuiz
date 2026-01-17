"use client";

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

export function useHost(userId: string | undefined) {
  const [isHost, setIsHost] = useState(false);
  const [isHostLoading, setIsHostLoading] = useState(true);
  const firestore = useFirestore();

  useEffect(() => {
    if (!userId) {
      setIsHost(false);
      setIsHostLoading(false);
      return;
    }

    let isSubscribed = true;

    const checkHostStatus = async () => {
      setIsHostLoading(true);
      const hostDocRef = doc(firestore, 'hosts', userId);
      try {
        const docSnap = await getDoc(hostDocRef);
        if (isSubscribed) {
          setIsHost(docSnap.exists());
        }
      } catch (error) {
        console.error("Error checking host status:", error);
        if (isSubscribed) {
          setIsHost(false);
        }
      } finally {
        if (isSubscribed) {
          setIsHostLoading(false);
        }
      }
    };

    checkHostStatus();

    return () => {
      isSubscribed = false;
    };
  }, [userId, firestore]);


  return { isHost, isHostLoading };
}
