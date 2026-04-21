import React from 'react';

export type SearchMode = 'search' | 'similar';

interface ModeToggleProps {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg w-fit">
      <button
        type="button"
        onClick={() => onChange('search')}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          mode === 'search'
            ? 'bg-white dark:bg-zinc-950 text-black dark:text-white shadow-sm'
            : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
        }`}
      >
        Search
      </button>
      <button
        type="button"
        onClick={() => onChange('similar')}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          mode === 'similar'
            ? 'bg-white dark:bg-zinc-950 text-black dark:text-white shadow-sm'
            : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
        }`}
      >
        Similar to...
      </button>
    </div>
  );
}
