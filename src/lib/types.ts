

export type Host = {
  id: string;
  username: string;
};

export type Question = {
  id: string;
  text: string;
  type: 'multiple-choice' | 'open-ended' | 'image' | 'video' | 'audio' | 'reorder';
  mediaUrl?: string | null; // For image, video, audio
  answerType?: 'multiple-choice' | 'open-ended' | null; // For media questions
  options?: string[];
  correctAnswer?: string | null;
  correctOrder?: string[];
};

export type Participant = {
  id: string; // Corresponds to Firebase Auth UID
  name: string;
  avatar: string;
  score: number;
};

export type Answer = {
  participantId: string;
  questionId: string;
  answerText: string;
  answerOrder?: string[]; // For reorder answers
  responseTime: number; // in seconds
  isCheating?: boolean;
  cheatingReason?: string;
  score?: number;
};

export type LeaderboardEntry = {
  id?: string; // document id from firestore
  rank?: number; // rank is calculated client-side
  name: string;
  monthlyScore: number;
  avatar: string;
};

export type Quiz = {
  id: string;
  name: string;
  hostId: string;
  state: "creating" | "lobby" | "live" | "question-results" | "results";
  questions: Question[];
  currentQuestionIndex: number;
  participants: Participant[];
  answers: Answer[];
}

export type StoredMedia = {
    id: string;
    name: string;
    type: string;
    url: string; // data URL
    createdAt: string;
}

export type UserProfile = {
    id: string; // Firebase Auth UID
    email: string;
    nickname: string;
    icon: string;
};
