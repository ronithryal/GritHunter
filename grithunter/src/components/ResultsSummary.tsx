import React from 'react';

interface ResultsSummaryProps {
  isLoadingSearch: boolean;
  isEnriching: boolean;
  loadedCount: number;
  totalFound: number;
  modeMismatchHint: string | null;
}

export function ResultsSummary({
  isLoadingSearch,
  isEnriching,
  loadedCount,
  totalFound,
  modeMismatchHint,
}: ResultsSummaryProps) {
  if (isLoadingSearch) {
    return (
      <div className="w-full mt-6 mb-2 flex items-center justify-between text-sm text-zinc-500">
        <div>Searching the public web...</div>
      </div>
    );
  }

  // Only show if we have found anything or are enriching
  if (totalFound === 0 && !isEnriching) return null;

  // The number of cards we ATTEMPT to enrich is min(totalFound, 5)
  const targetEnrichCount = Math.min(totalFound, 5);

  return (
    <div className="w-full mt-6 mb-4 space-y-2">
      {modeMismatchHint && (
        <div className="text-sm font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-md">
          {modeMismatchHint}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-sm text-zinc-500">
        <div>
          {loadedCount} of {targetEnrichCount} found
          {totalFound > 5 && ` (Refined from ${totalFound} partial matches)`}
        </div>
        {isEnriching && loadedCount < targetEnrichCount && (
          <div className="text-zinc-400 flex items-center gap-2 mt-1 sm:mt-0">
            <div className="w-3 h-3 rounded-full border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-600 dark:border-t-zinc-300 animate-spin" />
            Some results are still loading...
          </div>
        )}
      </div>
    </div>
  );
}
