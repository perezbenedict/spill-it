export const DISCUSSION_TEMPLATES = [
  {
    id: 'open-floor', name: 'Open floor',
    welcome_message: 'Welcome. Share a question, a perspective, or something worth discussing. Your voice stays anonymous.',
    available_categories: ['question', 'opinion', 'challenge', 'twocents'],
    min_content_length: 3, max_content_length: 1000, allow_manual_nickname: true,
    prompts: 'What would you like us to discuss?\nWhat perspective might we be missing?',
  },
  {
    id: 'questions', name: 'Audience Q&A',
    welcome_message: 'Ask the question on your mind. A moderator will review contributions before sharing them with the room.',
    available_categories: ['question'], min_content_length: 3, max_content_length: 600,
    allow_manual_nickname: true, prompts: 'What would you like to ask our speakers?',
  },
  {
    id: 'reflection', name: 'Guided reflection',
    welcome_message: 'Take a moment to reflect. Share what resonated, what challenged you, or what you will carry forward.',
    available_categories: ['opinion', 'challenge', 'twocents'],
    min_content_length: 3, max_content_length: 1000, allow_manual_nickname: true,
    prompts: 'What will you take away?\nWhat challenged your thinking?',
  },
];

// Templates intentionally never alter identity, schedule, status or join code.
export function templateSettings(template) {
  return Object.fromEntries(['welcome_message', 'available_categories', 'min_content_length',
    'max_content_length', 'allow_manual_nickname', 'prompts'].map(key => [key, template[key]]));
}
