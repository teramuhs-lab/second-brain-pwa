'use client';

import type { Category } from '@/lib/types';

interface CategoryButtonsProps {
  selected?: Category;
  onSelect: (category: Category | 'Ignore') => void;
  disabled?: boolean;
  showIgnore?: boolean;
}

const CATEGORIES: { value: Category | 'Ignore'; label: string; icon: string }[] = [
  { value: 'People', label: 'People', icon: '👤' },
  { value: 'Project', label: 'Project', icon: '🚀' },
  { value: 'Idea', label: 'Idea', icon: '💡' },
  { value: 'Admin', label: 'Admin', icon: '📋' },
  { value: 'Ignore', label: 'Ignore', icon: '✕' },
];

export function CategoryButtons({
  selected,
  onSelect,
  disabled = false,
  showIgnore = true,
}: CategoryButtonsProps) {
  const buttons = showIgnore ? CATEGORIES : CATEGORIES.filter((c) => c.value !== 'Ignore');

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((category) => {
        const isSelected = selected === category.value;
        const categoryClass = category.value.toLowerCase();

        return (
          <button
            key={category.value}
            onClick={() => onSelect(category.value)}
            disabled={disabled}
            className={`category-pill ${categoryClass} ${isSelected ? 'active' : ''} flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span className="text-sm">{category.icon}</span>
            <span>{category.label}</span>
          </button>
        );
      })}
    </div>
  );
}
