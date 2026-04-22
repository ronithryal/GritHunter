import React from 'react';

interface EmptyStateProps {
  hint?: string | null;
}

export function EmptyState({ hint }: EmptyStateProps) {
  return (
    <div className="w-full mt-6 p-12 flex flex-col items-center justify-center rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-center">
      <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
        No strong matches found.
      </h3>
      <p className="mt-2 text-sm text-zinc-500">
        Try broadening your description or using a different repo/profile URL as a seed.
      </p>
      {hint && (
        <p className="mt-3 text-sm font-medium text-amber-600 dark:text-amber-400">
          {hint}
        </p>
      )}
    </div>
  );
}
