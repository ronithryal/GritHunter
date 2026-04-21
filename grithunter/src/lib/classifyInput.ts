/**
 * GritHunter v1: Input Classification
 * 
 * Determines whether user input is a GitHub Profile URL, a GitHub Repo URL, 
 * or a Natural Language (NL) query.
 */

export type InputType = 'profile' | 'repo' | 'nl';

export function classifyInput(input: string): InputType {
  const trimmed = input.trim();
  if (!trimmed) return 'nl';

  // Normalize by stripping protocol and trailing slashes for regex simplicity
  let processed = trimmed.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  // Basic domain check
  if (!processed.startsWith('github.com/')) {
    return 'nl';
  }

  // Split paths
  const parts = processed.split('/').filter(Boolean);
  
  // parts[0] is 'github.com'
  // parts[1] is 'username' or 'org'
  // parts[2] is 'repo'
  
  if (parts.length === 2) {
    // Matches github.com/username
    return 'profile';
  }

  if (parts.length === 3) {
    // Matches github.com/org/repo
    return 'repo';
  }

  // Too deep or just github.com
  return 'nl';
}
