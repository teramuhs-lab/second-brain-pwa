// Shared UI constants for category styling
// Consolidates CATEGORY_COLORS and CATEGORY_ICONS from review, history, search pages

export const CATEGORY_ICONS: Record<string, string> = {
  People: '👤',
  Projects: '🚀',
  Ideas: '💡',
  Admin: '📋',
  Project: '🚀',
  Idea: '💡',
};

export const CATEGORY_GRADIENTS: Record<string, string> = {
  People: 'from-blue-500 to-cyan-500',
  Projects: 'from-green-500 to-emerald-500',
  Ideas: 'from-purple-500 to-pink-500',
  Admin: 'from-orange-500 to-amber-500',
  Project: 'from-green-500 to-emerald-500',
  Idea: 'from-purple-500 to-pink-500',
};

export const CATEGORY_BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  People: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  Project: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  Idea: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  Admin: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  Projects: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  Ideas: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
};
