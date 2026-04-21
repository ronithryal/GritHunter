/**
 * GritHunter v1: GitHub Handle Extractor
 *
 * Extracts GitHub handles from free-text Perplexity Agent API responses.
 * Handles multiple formats that Perplexity uses to mention GitHub users:
 *
 *   - @handle                        → bare handle
 *   - github.com/handle              → bare handle
 *   - https://github.com/handle      → bare handle
 *   - Numbered list entry            → "1. kmagiera —"
 *   - Plain bare handle on own line  → "jessjchang\nj-tomasik" (observed in live probe)
 *
 * The plain-bare-line pass runs last, after all prefixed formats, to avoid
 * false positives from prose that happens to contain a word matching the
 * handle pattern. Only lines whose ENTIRE trimmed content is a valid handle
 * are collected in this pass.
 *
 * All matches are normalized to lowercase, deduplicated (case-insensitive),
 * validated against GitHub handle rules, and capped at 10 handles in order
 * of first appearance.
 *
 * GitHub handle rules (from GitHub docs):
 *   - Alphanumeric characters and hyphens only
 *   - 1–39 characters
 *   - Cannot start or end with a hyphen
 */

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Returns true if the string is a syntactically valid GitHub handle.
 * Does NOT make an API call — purely a format check.
 */
function isValidHandle(handle: string): boolean {
  if (!handle || handle.length < 1 || handle.length > 39) return false;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(handle) && !/^[a-z0-9]$/i.test(handle)) return false;
  if (handle.startsWith('-') || handle.endsWith('-')) return false;
  return /^[a-z0-9][a-z0-9-]*$/i.test(handle);
}

// ─── Extraction ───────────────────────────────────────────────────────────────

/**
 * Extract GitHub handles from a Perplexity free-text response string.
 *
 * @param content - Raw text content from a Perplexity API response.
 * @returns Ordered array of up to 10 unique, lowercase, valid GitHub handles.
 */
export function extractHandles(content: string): string[] {
  if (!content || !content.trim()) return [];

  const seen = new Set<string>();
  const handles: string[] = [];

  function collect(raw: string) {
    const normalized = raw.toLowerCase();
    if (seen.has(normalized)) return;
    if (!isValidHandle(normalized)) return;
    seen.add(normalized);
    handles.push(normalized);
  }

  // ── 1. @handle ──────────────────────────────────────────────────────────────
  const atPattern = /@([a-z0-9][a-z0-9-]{0,38})/gi;
  for (const match of content.matchAll(atPattern)) {
    if (handles.length >= 10) break;
    collect(match[1]);
  }

  // ── 2. github.com/handle (with or without https://) ────────────────────────
  const urlPattern = /(?:https?:\/\/)?github\.com\/([a-z0-9][a-z0-9-]{0,38})(?:\/[^\s,)>\]"'`]*)?/gi;
  for (const match of content.matchAll(urlPattern)) {
    if (handles.length >= 10) break;
    const fullMatch = match[0];
    const handle = match[1];
    const afterHandle = fullMatch.slice(fullMatch.indexOf(handle) + handle.length);
    if (afterHandle.startsWith('/') && afterHandle.length > 1) continue;
    collect(handle);
  }

  // ── 3. Numbered list bare handles: "1. kmagiera —" or "2. brentvatne\n" ───
  const numberedPattern = /^\s*\d+\.\s+([a-z0-9][a-z0-9-]{0,38})(?:\s|—|-|:|$)/gim;
  for (const match of content.matchAll(numberedPattern)) {
    if (handles.length >= 10) break;
    collect(match[1]);
  }

  // ── 4. Plain bare handles on their own line ───────────────────────────────
  // Observed in live Perplexity response (2026-04-21): the API returns just
  // "jessjchang\nj-tomasik" with no @, URL, or numbering prefix.
  // This pass only collects lines whose ENTIRE trimmed content is a valid handle
  // (i.e. the line contains nothing else — a single token, no spaces).
  const lines = content.split('\n');
  for (const line of lines) {
    if (handles.length >= 10) break;
    const trimmed = line.trim();
    // Skip lines that contain spaces (prose) or are empty
    if (!trimmed || trimmed.includes(' ')) continue;
    // Only collect if it looks like a handle (no special chars other than hyphens)
    if (/^[a-z0-9][a-z0-9-]{0,38}$/i.test(trimmed)) {
      collect(trimmed);
    }
  }

  return handles.slice(0, 10);
}
