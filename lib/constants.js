export const CATEGORIES = [
  {
    key: 'question',
    label: 'Ask a question',
    hint: 'Stuck on something? Toss it into the room and see who relates.',
  },
  {
    key: 'opinion',
    label: 'Drop an opinion',
    hint: 'Talk am with your full chest.',
  },
  {
    key: 'challenge',
    label: 'Shake that table',
    hint: "Got something that'll get us talking? Put it out there.",
  },
  {
    key: 'twocents',
    label: 'Add your two cents',
    hint: 'Let us know your mind.',
  },
];

export const SESSION_STATUSES = ['draft', 'live', 'paused', 'closed'];

export const MODERATION_STATUSES = ['pending', 'approved', 'hidden'];

export const DEFAULT_MIN_CONTENT_LENGTH = 3;
export const DEFAULT_MAX_CONTENT_LENGTH = 1000;
export const MAX_NICKNAME_LENGTH = 60;

export const RATE_LIMIT = { maxSubmissions: 5, windowSeconds: 60 };

export const DUPLICATE_WINDOW_SECONDS = 600;
