export const CATEGORIES = [
  {
    key: 'question',
    label: 'Ask a Question',
    hint: 'Stuck on something? Toss it to the room and see who bites.',
  },
  {
    key: 'opinion',
    label: 'Drop an Opinion',
    hint: 'Hot take incoming - say it with your whole chest.',
  },
  {
    key: 'challenge',
    label: 'Challenge the Room',
    hint: 'Think you can change some minds? Give it a shot.',
  },
  {
    key: 'twocents',
    label: 'Add Your Two Cents',
    hint: 'Weigh in quick - sometimes two cents is all it takes.',
  },
];

export const SESSION_STATUSES = ['draft', 'live', 'paused', 'closed'];

export const MODERATION_STATUSES = ['pending', 'approved', 'hidden'];

export const DEFAULT_MIN_CONTENT_LENGTH = 3;
export const DEFAULT_MAX_CONTENT_LENGTH = 1000;
export const MAX_NICKNAME_LENGTH = 60;

export const RATE_LIMIT = { maxSubmissions: 5, windowSeconds: 60 };

export const DUPLICATE_WINDOW_SECONDS = 600;
