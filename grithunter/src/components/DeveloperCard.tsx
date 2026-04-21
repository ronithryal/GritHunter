import React from 'react';
import type { EvidenceCard } from '@/lib/types';
import { SignalTags } from './SignalTags';

interface DeveloperCardProps {
  card: EvidenceCard | null;
  handle: string; // If card is null (loading) or degraded
  isLoading: boolean;
}

export function DeveloperCard({ card, handle, isLoading }: DeveloperCardProps) {
  if (isLoading) {
    return (
      <div className="w-full p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm animate-pulse">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
          <div className="space-y-2">
            <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="h-3 w-24 bg-zinc-200 dark:bg-zinc-800 rounded" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full bg-zinc-200 dark:bg-zinc-800 rounded" />
          <div className="h-3 w-5/6 bg-zinc-200 dark:bg-zinc-800 rounded" />
          <div className="h-3 w-4/6 bg-zinc-200 dark:bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }

  // Degraded or failed state from Perplexity
  if (!card || card.error === 'unavailable') {
    return (
      <div className="w-full p-6 bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/50 rounded-xl shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-lg font-semibold text-zinc-500">
            {handle.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              <a href={`https://github.com/${handle}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {handle}
              </a>
            </h3>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              Evidence unavailable — try refreshing.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const {
    github_handle,
    summary,
    signals,
    location,
    followers,
    public_repos,
    top_languages,
    last_verified_at,
  } = card;

  const isLimitedSignal = signals.length === 0;

  return (
    <div className="w-full p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-lg font-semibold text-zinc-700 dark:text-zinc-300">
            {github_handle.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <a href={`https://github.com/${github_handle}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {github_handle}
              </a>
              {isLimitedSignal && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  Limited public signal
                </span>
              )}
            </h3>
            {location && (
              <p className="text-sm text-zinc-500">
                {location}
              </p>
            )}
          </div>
        </div>
        
        {/* Metadata stats */}
        <div className="text-right text-xs text-zinc-500 space-y-1">
          {followers !== undefined && <div>{followers} followers</div>}
          {public_repos !== undefined && <div>{public_repos} repos</div>}
        </div>
      </div>

      {summary ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          {summary}
        </p>
      ) : (
        <p className="text-sm italic text-zinc-500 leading-relaxed">
          Limited public signal — fewer sources available.
        </p>
      )}

      {top_languages && top_languages.length > 0 && (
        <div className="mt-4 text-xs text-zinc-500 font-medium">
          Top Languages: {top_languages.join(' • ')}
        </div>
      )}

      <SignalTags signals={signals} />

      <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/50 text-[10px] text-zinc-400">
        Last verified: {new Date(last_verified_at).toLocaleString()}
      </div>
    </div>
  );
}
