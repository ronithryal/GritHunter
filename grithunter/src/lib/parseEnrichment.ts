/**
 * GritHunter v1: Perplexity Enrichment Parser
 *
 * Parses a raw content string from a Perplexity Agent API enrichment call
 * into a ParsedEnrichment object. This function is intentionally Perplexity-
 * surface-agnostic: it receives a normalized string, not an API envelope.
 * Envelope normalization is the responsibility of perplexityClient.ts.
 *
 * Implements the requirements in REVIEW.md CQ-1 and design.md:
 *   - Strip leading ```json and trailing ``` fences before JSON.parse
 *   - If JSON.parse fails: prose fallback (regex for github_handle + summary)
 *   - Validate each url field: must match ^https?:// — drop invalid silently
 *   - Cap signals array at 6 per card
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export const SIGNAL_TYPES = ['repo', 'blog', 'npm', 'talk', 'so', 'hn', 'x'] as const;
export type SignalType = typeof SIGNAL_TYPES[number];

export type SignalTag = {
  type: SignalType;
  label: string;
  url?: string; // only present if it passes ^https?:// validation
};

/**
 * The Perplexity-owned portion of an EvidenceCard.
 * GitHub-sourced fields (followers, public_repos, top_languages, last_verified_at)
 * are added by the route handler after the GitHub API fetch.
 */
export type ParsedEnrichment = {
  github_handle: string;
  summary: string | null;
  signals: SignalTag[];
  location?: string;
  /** True if the result came from the JSON-parse path; false if prose fallback was used. */
  parsed_cleanly: boolean;
};

// ─── URL Validation ────────────────────────────────────────────────────────────

const URL_PATTERN = /^https?:\/\//;

function isValidUrl(url: unknown): url is string {
  return typeof url === 'string' && URL_PATTERN.test(url);
}

// ─── Signal Validation ────────────────────────────────────────────────────────

function isValidSignalType(type: unknown): type is SignalType {
  return typeof type === 'string' && (SIGNAL_TYPES as readonly string[]).includes(type);
}

function normalizeSignals(raw: unknown): SignalTag[] {
  if (!Array.isArray(raw)) return [];

  const signals: SignalTag[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!label) continue; // drop signals with no label

    const type: SignalType = isValidSignalType(item.type) ? item.type : 'repo';
    const signal: SignalTag = { type, label };

    if (isValidUrl(item.url)) {
      signal.url = item.url;
    }
    // Invalid or absent url: omit the url field entirely (silent drop per spec)

    signals.push(signal);
    if (signals.length === 6) break; // cap at 6 per spec
  }
  return signals;
}

// ─── Fence Stripping ──────────────────────────────────────────────────────────

/**
 * Strips leading ```json / ``` fences that Perplexity frequently wraps around
 * JSON output even when explicitly asked not to. This is the common case (CQ-1).
 */
function stripFences(raw: string): string {
  let s = raw.trim();

  // Pattern: ```json\n...\n``` (with optional whitespace around the language tag)
  if (s.startsWith('```')) {
    // Remove the opening fence line (e.g. "```json" or "```")
    const firstNewline = s.indexOf('\n');
    if (firstNewline !== -1) {
      s = s.slice(firstNewline + 1).trim();
    }
    // Remove the closing fence
    if (s.endsWith('```')) {
      s = s.slice(0, s.lastIndexOf('```')).trim();
    }
  }

  return s;
}

// ─── Prose Fallback ───────────────────────────────────────────────────────────

/**
 * Last-resort extraction when JSON.parse fails. Tries to salvage a handle
 * and summary from malformed or prose output.
 */
function proseFallback(
  rawContent: string,
  githubHandle: string,
): ParsedEnrichment {
  // Try to find "github_handle": "somevalue" anywhere in the string
  const handleMatch = rawContent.match(/"github_handle"\s*:\s*"([^"]+)"/);
  const handle = handleMatch?.[1] ?? githubHandle;

  // Try to find "summary": "somevalue" (captures until closing quote, non-greedy)
  const summaryMatch = rawContent.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const summary = summaryMatch?.[1] ?? null;

  return {
    github_handle: handle,
    summary,
    signals: [],
    parsed_cleanly: false,
  };
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

/**
 * Parse a raw Perplexity enrichment content string into a ParsedEnrichment.
 *
 * @param rawContent - The text content extracted from a Perplexity API response.
 *                     Must already be a plain string (no envelope).
 * @param githubHandle - The GitHub handle being enriched; used as fallback in
 *                       case Perplexity omits it from the JSON output.
 */
export function parseEnrichment(
  rawContent: string,
  githubHandle: string,
): ParsedEnrichment {
  const stripped = stripFences(rawContent);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // JSON parse failed — use prose fallback
    return proseFallback(rawContent, githubHandle);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return proseFallback(rawContent, githubHandle);
  }

  const obj = parsed as Record<string, unknown>;

  const handle =
    typeof obj.github_handle === 'string' && obj.github_handle.trim()
      ? obj.github_handle.trim()
      : githubHandle;

  const summary =
    typeof obj.summary === 'string' && obj.summary.trim()
      ? obj.summary.trim()
      : null;

  const signals = normalizeSignals(obj.signals);

  const location =
    typeof obj.location === 'string' && obj.location.trim()
      ? obj.location.trim()
      : undefined;

  return {
    github_handle: handle,
    summary,
    signals,
    location,
    parsed_cleanly: true,
  };
}
