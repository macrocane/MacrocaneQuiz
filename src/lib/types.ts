
export type Host = {
  id: string;
  username: string;
};

export type Question = {
  id: string;
  text: string;
  type: 'multiple-choice' | 'open-ended' | 'image' | 'video' | 'audio' | 'reorder';
  mediaUrl?: string | null;
  answerType?: 'multiple-choice' | 'open-ended' | null;
  options?: string[];
  correctAnswer?: string | null;
  correctOrder?: string[];
};

export type Participant = {
  id: string;
  name: string;
  avatar: string;
  score: number;
  jollyActive?: boolean;
  jollyAvailable?: boolean;
};

export type Answer = {
  participantId: string;
  questionId: string;
  answerText: string;
  answerOrder?: string[];
  responseTime: number;
  isCheating?: boolean;
  cheatingReason?: string;
  score?: number;
};

export type LeaderboardEntry = {
  id?: string;
  rank?: number;
  name: string;
  monthlyScore: number;
  avatar: string;
  quizzesPlayed?: number;
};

export type Quiz = {
  id: string;
  name: string;
  hostId: string;
  state: "creating" | "lobby" | "live" | "question-results" | "results";
  questions: Question[];
  currentQuestionIndex: number;
  topics?: string[];
}

export type StoredMedia = {
    id: string;
    name: string;
    type: 'image' | 'video' | 'audio';
    url: string;
    createdAt: string;
}

export type UserProfile = {
    id: string;
    email: string;
    nickname: string;
    icon: string;
    jollyAvailable?: boolean;
};

export type AppSettings = {
  rules: string;
  jollyEnabled?: boolean;
  leaderboardEnabled?: boolean;
  totalQuizzesHeld?: number;
};
