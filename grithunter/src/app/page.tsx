'use client';

import React, { useState } from 'react';
import { ModeToggle, SearchMode } from '@/components/ModeToggle';
import { SearchForm } from '@/components/SearchForm';
import { ResultsSummary } from '@/components/ResultsSummary';
import { DeveloperCard } from '@/components/DeveloperCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import type { EvidenceCard, SearchResponse } from '@/lib/types';

type SearchError = '429' | '503' | 'search_failed' | 'invalid_url';

export default function Home() {
  const [mode, setMode] = useState<SearchMode>('search');
  
  // Search State
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<SearchError | null>(null);
  const [modeMismatchHint, setModeMismatchHint] = useState<string | null>(null);
  const [hasEverSearched, setHasEverSearched] = useState(false);

  // Abort controller for enrich requests
  const abortRef = React.useRef<AbortController | null>(null);
  
  // Search Results
  const [handles, setHandles] = useState<string[]>([]);
  const [total, setTotal] = useState<number>(0);
  
  // Enrichment State
  const [isEnriching, setIsEnriching] = useState(false);
  // Store cards by handle to maintain rank order
  const [enrichedCards, setEnrichedCards] = useState<Record<string, EvidenceCard | null>>({});

  const enrichHandle = async (handle: string, abortSignal: AbortSignal) => {
    try {
      const res = await fetch(`/api/enrich/${handle}`, { signal: abortSignal });
      if (!res.ok) {
        throw new Error('Enrichment temporary failure');
      }
      if (abortSignal.aborted) return;
      const card = await res.json() as EvidenceCard;
      if (abortSignal.aborted) return;
      setEnrichedCards(prev => ({ ...prev, [handle]: card }));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (abortSignal.aborted) return;
      // Synthesize degraded card on 5xx or fetch failure
      setEnrichedCards(prev => ({
        ...prev,
        [handle]: {
          github_handle: handle,
          summary: null,
          signals: [],
          last_verified_at: new Date().toISOString(),
          error: 'unavailable'
        }
      }));
    }
  };

  const handleSearchSubmit = async (query: string) => {
    // Cancel any previous enrichments
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    // Reset state
    setHasEverSearched(true);
    setIsSearching(true);
    setSearchError(null);
    setModeMismatchHint(null);
    setHandles([]);
    setTotal(0);
    setEnrichedCards({});
    setIsEnriching(false);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (res.status === 429) {
        setSearchError('429');
        setIsSearching(false);
        return;
      }
      if (res.status === 503) {
        setSearchError('503');
        setIsSearching(false);
        return;
      }
      if (!res.ok) {
        setSearchError('search_failed');
        setIsSearching(false);
        return;
      }

      const data = await res.json() as SearchResponse;
      setHandles(data.handles);
      setTotal(data.total);

      // Check mode mismatch using server response
      if (mode === 'search' && (data.detectedMode === 'profile' || data.detectedMode === 'repo')) {
        setModeMismatchHint('That looks like a GitHub URL — switching to Similarity mode behavior.');
      } else if (mode === 'similar' && data.detectedMode === 'nl') {
        setModeMismatchHint('That looks like a search query — switching to Search mode.');
      }

      setIsSearching(false);

      if (data.handles.length > 0) {
        setIsEnriching(true);
        const topHandles = data.handles.slice(0, 10);
        
        // Initialize keys
        const initialCards: Record<string, null> = {};
        topHandles.forEach(h => initialCards[h] = null);
        setEnrichedCards(initialCards);

        // Fetch parallel
        await Promise.allSettled(
          topHandles.map(handle => enrichHandle(handle, signal))
        );
        setIsEnriching(false);
      }

    } catch (err: unknown) {
      setSearchError('search_failed');
      setIsSearching(false);
    }
  };

  const hasSearched = hasEverSearched && !isSearching && searchError === null;
  const loadedCount = Object.values(enrichedCards).filter(c => c !== null).length;
  const targetHandles = handles.slice(0, 10);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center py-16 px-6 sm:px-16 bg-white dark:bg-black sm:items-start">
        
        {/* Header & Input */}
        <div className="w-full flex flex-col items-center sm:items-start gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50 mb-2">
            GritHunter
          </h1>
          <ModeToggle mode={mode} onChange={setMode} />
          <SearchForm mode={mode} onSubmit={handleSearchSubmit} isLoading={isSearching} />
        </div>

        {/* Global Errors */}
        {searchError && <ErrorState errorType={searchError} />}

        {/* Post-submit states */}
        {hasSearched ? (
          handles.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="w-full">
              <ResultsSummary 
                isLoadingSearch={isSearching}
                isEnriching={isEnriching}
                loadedCount={loadedCount}
                totalFound={total}
                modeMismatchHint={modeMismatchHint}
              />
              
              <div className="w-full flex flex-col gap-4">
                {targetHandles.map(handle => {
                  const card = enrichedCards[handle];
                  return (
                    <DeveloperCard 
                      key={handle}
                      handle={handle}
                      card={card ?? null}
                      isLoading={card === null}
                    />
                  );
                })}
              </div>
            </div>
          )
        ) : isSearching ? (
          <ResultsSummary 
            isLoadingSearch={true}
            isEnriching={false}
            loadedCount={0}
            totalFound={0}
            modeMismatchHint={null}
          />
        ) : null}

      </main>
    </div>
  );
}
