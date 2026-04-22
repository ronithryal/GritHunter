import React from 'react';
import { SearchMode } from './ModeToggle';

interface SearchFormProps {
  mode: SearchMode;
  onSubmit: (query: string) => void;
  isLoading: boolean;
  query: string;
  onQueryChange: (query: string) => void;
}

export function SearchForm({ mode, onSubmit, isLoading, query, onQueryChange }: SearchFormProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSubmit(query.trim());
    }
  };

  const placeholder =
    mode === 'search'
      ? 'e.g., React Native engineers in SF who shipped App Store apps'
      : 'e.g., github.com/facebook/react-native';

  return (
    <form onSubmit={handleSubmit} className="w-full mt-4 flex flex-col gap-3">
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        disabled={isLoading}
        className="w-full p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isLoading || !query.trim()}
        className="w-full sm:w-auto self-end px-6 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
      >
        {isLoading ? 'Searching...' : 'Search'}
      </button>
    </form>
  );
}
