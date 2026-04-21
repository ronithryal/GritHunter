import React from 'react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Home from '@/app/page';
import { DeveloperCard } from '@/components/DeveloperCard';
import type { EvidenceCard } from '@/lib/types';

// Mock fetch globally
const originalFetch = global.fetch;

describe('Frontend Tests (M4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn() as Mock;
  });

  describe('DeveloperCard', () => {
    it('renders normal EvidenceCard', () => {
      const card: EvidenceCard = {
        github_handle: 'testuser',
        summary: 'A great dev.',
        signals: [
          { type: 'repo', label: 'built things' },
        ],
        followers: 100,
        public_repos: 50,
        last_verified_at: '2026-04-21T00:00:00Z',
      };

      render(<DeveloperCard card={card} handle="testuser" isLoading={false} />);
      
      expect(screen.getByText('testuser')).toBeDefined();
      expect(screen.getByText('A great dev.')).toBeDefined();
      expect(screen.getByText('100 followers')).toBeDefined();
      expect(screen.getByText('50 repos')).toBeDefined();
      expect(screen.getByText(/REPO:/)).toBeDefined();
    });

    it('renders degraded state', () => {
      const degradedCard: EvidenceCard = {
        github_handle: 'baduser',
        summary: null,
        signals: [],
        error: 'unavailable',
        last_verified_at: '2026-04-21T00:00:00Z'
      };

      render(<DeveloperCard card={degradedCard} handle="baduser" isLoading={false} />);
      
      expect(screen.getByText('baduser')).toBeDefined();
      expect(screen.getByText(/Evidence unavailable/)).toBeDefined();
    });

    it('renders limited public signal and fallback summary', () => {
      const limitedCard: EvidenceCard = {
        github_handle: 'thinuser',
        summary: null,
        signals: [],
        last_verified_at: '2026-04-21T00:00:00Z'
      };

      render(<DeveloperCard card={limitedCard} handle="thinuser" isLoading={false} />);
      
      expect(screen.getByText('thinuser')).toBeDefined();
      expect(screen.getAllByText(/Limited public signal/)).toBeDefined();
      expect(screen.getByText(/fewer sources available/)).toBeDefined();
    });
  });

  describe('Home Page Orchestration', () => {
    it('initial render has no empty state, but 0 handles search shows empty state', async () => {
      render(<Home />);
      
      // Initially, no "No strong matches found"
      expect(screen.queryByText(/No strong matches found/)).toBeNull();

      const input = screen.getByPlaceholderText(/e\.g\., React Native/);
      fireEvent.change(input, { target: { value: 'ghost' } });
      
      const submitBtn = screen.getAllByRole('button', { name: 'Search' })[1];
      
      (global.fetch as Mock).mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ handles: [], total: 0 })
        })
      );
      
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/No strong matches found/)).toBeDefined();
      });
    });

    it('handles search API error states (429, 503, 500)', async () => {
      render(<Home />);
      const input = screen.getByPlaceholderText(/e\.g\., React Native/);
      const submitBtn = screen.getAllByRole('button', { name: 'Search' })[1];
      
      // 429
      fireEvent.change(input, { target: { value: 'query' } });
      (global.fetch as Mock).mockImplementationOnce(() => 
        Promise.resolve({ ok: false, status: 429 })
      );
      fireEvent.click(submitBtn);
      await waitFor(() => expect(screen.getByText(/hit the search limit/)).toBeDefined());

      // 503
      (global.fetch as Mock).mockImplementationOnce(() => 
        Promise.resolve({ ok: false, status: 503 })
      );
      fireEvent.click(submitBtn);
      await waitFor(() => expect(screen.getByText(/Daily capacity reached/)).toBeDefined());

      // 500
      (global.fetch as Mock).mockImplementationOnce(() => 
        Promise.resolve({ ok: false, status: 500 })
      );
      fireEvent.click(submitBtn);
      await waitFor(() => expect(screen.getByText(/temporarily unavailable/)).toBeDefined());
    });

    it('renders mode mismatch hint when returned by server', async () => {
      render(<Home />);
      
      // 1. We are in Search mode, but query is a repo url, server detected 'repo'
      const input = screen.getByPlaceholderText(/e\.g\., React Native/);
      fireEvent.change(input, { target: { value: 'https://github.com/foo/bar' } });
      const submitBtn = screen.getAllByRole('button', { name: 'Search' })[1];
      
      (global.fetch as Mock).mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ handles: ['user1'], total: 1, detectedMode: 'repo' })
        })
      );

      // stub enrich immediately
      (global.fetch as Mock).mockImplementationOnce((url: string) => 
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ github_handle: 'user1', summary: 'x', signals: [], last_verified_at: 'x' })
        })
      );

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/switching to Similarity mode behavior/)).toBeDefined();
      });

      // 2. We switch to Similar to... mode, but submit a text query, server detected 'nl'
      const similarBtn = screen.getByText('Similar to...');
      fireEvent.click(similarBtn);

      fireEvent.change(input, { target: { value: 'I want a python dev' } });
      (global.fetch as Mock).mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ handles: ['user2'], total: 1, detectedMode: 'nl' })
        })
      );

      // stub enrich immediately
      (global.fetch as Mock).mockImplementationOnce((url: string) => 
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ github_handle: 'user2', summary: 'y', signals: [], last_verified_at: 'y' })
        })
      );

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/switching to Search mode/)).toBeDefined();
      });
    });

    it('progressive loading orchestration preserves rank order under out-of-order resolution', async () => {
      render(<Home />);

      const searchBtn = screen.getAllByRole('button', { name: 'Search' })[1];
      const input = screen.getByPlaceholderText(/e\.g\., React Native/);
      
      fireEvent.change(input, { target: { value: 'rank preservation' } });
      
      // Mock /api/search response
      (global.fetch as Mock).mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ handles: ['dev1', 'dev2'], total: 2 })
        })
      );

      // Mock /api/enrich responses — dev2 is fast (10ms), dev1 is slow (100ms)
      (global.fetch as Mock).mockImplementation((url: string) => {
        if (url.includes('dev1')) {
          return new Promise(resolve => setTimeout(() => resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              github_handle: 'dev1',
              summary: 'Dev1 summary',
              signals: [],
              last_verified_at: ''
            })
          }), 100));
        }
        if (url.includes('dev2')) {
          return new Promise(resolve => setTimeout(() => resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              github_handle: 'dev2',
              summary: 'Dev2 summary',
              signals: [],
              last_verified_at: ''
            })
          }), 10));
        }
        return Promise.reject(new Error('not mocked'));
      });

      fireEvent.click(searchBtn);

      await waitFor(() => {
        expect(screen.getByText('Dev1 summary')).toBeDefined();
        expect(screen.getByText('Dev2 summary')).toBeDefined();
      });

      const dev1node = screen.getByText('Dev1 summary');
      const dev2node = screen.getByText('Dev2 summary');
      
      const pos = dev1node.compareDocumentPosition(dev2node);
      expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      
      expect(screen.getByText(/2 of 2 found/)).toBeDefined();
    });

    it('aborts previous enrichments when a new search starts', async () => {
      render(<Home />);
      const searchBtn = screen.getAllByRole('button', { name: 'Search' })[1];
      const input = screen.getByPlaceholderText(/e\.g\., React Native/);
      
      // Start Search A
      fireEvent.change(input, { target: { value: 'search A' } });
      (global.fetch as Mock).mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ handles: ['devA'], total: 1 })
        })
      );

      // Let enrich for A hang forever
      let resolveEnrichA: any;
      (global.fetch as Mock).mockImplementationOnce((url: string, init?: any) => {
        return new Promise(resolve => {
          resolveEnrichA = () => {
            if (init?.signal?.aborted) {
              return resolve({ ok: true, json: () => Promise.reject(new DOMException('Aborted', 'AbortError')) });
            }
            return resolve({
              ok: true,
              json: () => Promise.resolve({
                github_handle: 'devA',
                summary: 'Summary A',
                signals: [],
                last_verified_at: ''
              })
            });
          };
        });
      });

      fireEvent.click(searchBtn);
      
      // Wait for search A to finish and enrich A to start
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

      // Immediately start Search B
      fireEvent.change(input, { target: { value: 'search B' } });
      (global.fetch as Mock).mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ handles: ['devB'], total: 1 })
        })
      );
      (global.fetch as Mock).mockImplementationOnce(() => 
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            github_handle: 'devB',
            summary: 'Summary B',
            signals: [],
            last_verified_at: ''
          })
        })
      );

      fireEvent.click(searchBtn);

      await waitFor(() => {
        expect(screen.getByText('Summary B')).toBeDefined();
      });

      // Now resolve A's hanging request
      resolveEnrichA();

      // Ensure A's card never shows
      expect(screen.queryByText('Summary A')).toBeNull();
    });
  });
});
