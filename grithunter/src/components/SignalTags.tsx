import React from 'react';
import type { SignalTag as SignalTagType } from '@/lib/types';

const SIGNAL_COLORS: Record<SignalTagType['type'], string> = {
  repo: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  blog: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  npm: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  talk: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  so: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  hn: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  x: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300',
};

interface SignalTagsProps {
  signals: SignalTagType[];
}

export function SignalTags({ signals }: SignalTagsProps) {
  if (!signals || signals.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {signals.map((signal, idx) => {
        const colorClass = SIGNAL_COLORS[signal.type] || 'bg-zinc-100 text-zinc-800';
        
        const content = (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
          >
            {signal.type.toUpperCase()}: {signal.label}
          </span>
        );

        if (signal.url) {
          return (
            <a
              key={idx}
              href={signal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-opacity"
            >
              {content}
            </a>
          );
        }

        return <span key={idx}>{content}</span>;
      })}
    </div>
  );
}
