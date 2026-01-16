"use client";

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

export function useHost(userId: string | undefined) {
  const [isHost, setIsHost] = useState(false);
  const [isHostLoading, setIsHostLoading] = useState(true);
  const [hasAttempted, setHasAttempted] = useState(false); // Flag to prevent re-fetching
  const firestore = useFirestore();

  useEffect(() => {
    // If we have no user ID, or if we've already tried and failed, don't do anything.
    if (!userId) {
      setIsHost(false);
      setIsHostLoading(false);
      return;
    }

    if (hasAttempted) {
        // If we've already attempted a check for this user, don't try again.
        // This prevents loops if the first check resulted in an error.
        return;
    }

    const checkHostStatus = async () => {
      setIsHostLoading(true);
      setHasAttempted(true); // Mark that we are attempting the check
      const hostDocRef = doc(firestore, 'hosts', userId);
      try {
        const docSnap = await getDoc(hostDocRef);
        setIsHost(docSnap.exists());
      } catch (error) {
        console.error("Error checking host status:", error);
        setIsHost(false);
      } finally {
        setIsHostLoading(false);
      }
    };

    checkHostStatus();
  }, [userId, firestore, hasAttempted]);

  // When the user ID changes (logout/login), reset the attempt flag
  useEffect(() => {
    setHasAttempted(false);
  }, [userId]);


  return { isHost, isHostLoading };
}
