/**
 * GritHunter Search Quality Eval Fixture
 * ----------------------------------------
 * NOT part of the automated test suite. Run manually:
 *
 *   npx tsx test/eval/search-quality.eval.ts
 *
 * Outputs a table: query, handles returned, count, and a slot for
 * manual quality scoring (1=standout, 2=correct but not impressive, 3=wrong).
 *
 * Purpose: measure before/after impact of M5 prompt changes.
 * Methodology: run before AND after shipping changes, compare outputs.
 */

interface EvalCase {
  label: string;
  query: string;
  /** At least one of these handles should appear in top results (optional) */
  expectedHandles?: string[];
  /** Minimum acceptable result count (optional) */
  minResults?: number;
}

const EVAL_SET: EvalCase[] = [
  {
    label: 'React Native SF',
    query: 'React Native engineers in SF who shipped App Store apps',
    expectedHandles: ['brentvatne', 'kmagiera'],
    minResults: 3,
  },
  {
    label: 'Go + Prometheus exporters',
    query: 'Go engineers who built production Prometheus exporters',
    minResults: 3, // niche query — verify domain expansion works
  },
  {
    label: 'DevOps + Terraform + AWS self-healing',
    query: 'DevOps engineers who work with Terraform on AWS self-healing infrastructure',
    minResults: 3, // niche intersection — was returning 4 before M5
  },
  {
    label: 'Repo similarity — facebook/react-native',
    query: 'https://github.com/facebook/react-native',
    minResults: 3,
  },
  {
    label: 'Profile similarity — brentvatne',
    query: 'https://github.com/brentvatne',
    expectedHandles: ['kmagiera', 'evanbacon', 'satya164'],
    minResults: 3,
  },
];

// ── Baseline results (recorded before M5 changes, 2026-04-22) ─────────────────
const BASELINE: Record<string, { handles: string[]; total: number }> = {
  'React Native SF': {
    handles: ['mmazzarolo'],
    total: 1,
  },
  'Go + Prometheus exporters': {
    handles: ['burningalchemist', 'braedon', 'mikejoh', 'songlee24', 'rsmitty',
              'tomhollingworth', 'mzupan', 'superq', 'didiatworkz', 'lordofthejars'],
    total: 10,
  },
  'DevOps + Terraform + AWS self-healing': {
    handles: ['hammadhaqqani', 'yashodhan271', 'francescocheema', 'isaactony'],
    total: 4,
  },
  'Repo similarity — facebook/react-native': {
    handles: [],
    total: 0,
  },
  'Profile similarity — brentvatne': {
    handles: ['ide', 'evanbacon', 'satya164', 'kmagiera', 'oblador', 'ds300'],
    total: 6,
  },
};

// ── Runner ────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.EVAL_BASE_URL ?? 'http://localhost:3000';

async function runQuery(
  evalCase: EvalCase,
): Promise<{ handles: string[]; total: number }> {
  const res = await fetch(`${BASE_URL}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: evalCase.query }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    console.error(`  [ERROR] ${res.status} ${res.statusText}`);
    return { handles: [], total: 0 };
  }
  const data = await res.json() as { handles: string[]; total: number };
  return data;
}

function grade(evalCase: EvalCase, result: { handles: string[]; total: number }): string {
  const issues: string[] = [];

  if (evalCase.minResults !== undefined && result.total < evalCase.minResults) {
    issues.push(`⚠ only ${result.total} results (need ≥${evalCase.minResults})`);
  }
  if (evalCase.expectedHandles) {
    const found = evalCase.expectedHandles.filter(h => result.handles.includes(h));
    if (found.length === 0) {
      issues.push(`⚠ none of expected handles found: ${evalCase.expectedHandles.join(', ')}`);
    } else {
      issues.push(`✓ expected handles present: ${found.join(', ')}`);
    }
  }
  return issues.length > 0 ? issues.join(' | ') : '✓ pass';
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log(' GritHunter Search Quality Eval');
  console.log(` Target: ${BASE_URL}`);
  console.log(` Time:   ${new Date().toISOString()}`);
  console.log('════════════════════════════════════════════════════════\n');

  for (const evalCase of EVAL_SET) {
    console.log(`▶ ${evalCase.label}`);
    console.log(`  Query: "${evalCase.query}"`);

    const result = await runQuery(evalCase);

    const baseline = BASELINE[evalCase.label];
    const deltaTotal = baseline
      ? result.total - baseline.total
      : null;
    const deltaStr = deltaTotal !== null
      ? ` (${deltaTotal >= 0 ? '+' : ''}${deltaTotal} vs baseline)`
      : '';

    console.log(`  Handles (${result.total}${deltaStr}): ${result.handles.join(', ') || '(none)'}`);

    if (baseline) {
      const newHandles = result.handles.filter(h => !baseline.handles.includes(h));
      const droppedHandles = baseline.handles.filter(h => !result.handles.includes(h));
      if (newHandles.length > 0) console.log(`  New:     ${newHandles.join(', ')}`);
      if (droppedHandles.length > 0) console.log(`  Dropped: ${droppedHandles.join(', ')}`);
    }

    const verdict = grade(evalCase, result);
    console.log(`  Grade:  ${verdict}`);
    console.log(`  Quality [score manually 1–3]: ___`);
    console.log('');
  }

  console.log('════════════════════════════════════════════════════════');
  console.log(' Manual quality scoring: 1=standout | 2=correct-but-not-impressive | 3=wrong');
  console.log('════════════════════════════════════════════════════════\n');
}

main().catch(console.error);

// ── Change 3 Pre-ship Pilot ───────────────────────────────────────────────────
//
// Run separately to validate the enrichment prompt before shipping Change 3.
// Checks that the output:
//   1. Distinguishes code quality (not just biography)
//   2. Cites a specific repo URL as evidence
//   3. Returns parseable JSON with a populated signals array
//
// Usage:
//   EVAL_PILOT=1 npx tsx test/eval/search-quality.eval.ts
//
// Manual pass criteria (score each 1=pass / 0=fail):
//   [ ] summary mentions code quality (error handling, tests, structure, or maintenance)
//   [ ] summary cites at least one specific repo URL
//   [ ] signals array has ≥1 entry
//   [ ] for the less-known dev: output honestly reflects thin public record if applicable
//
// If ≥2 of the 3 pilot subjects fail, revert Change 3 — ship Changes 1, 2, 4 only.

const PILOT_HANDLES = [
  'brentvatne',   // well-known React Native author — should produce rich code quality signal
  'kmagiera',     // well-known React Native / Reanimated author — same expectation
  'mmazzarolo',   // less-known dev (appeared in baseline) — tests honest "thin record" handling
];

async function runEnrichPilot() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log(' Change 3 Enrichment Pilot');
  console.log(` Target: ${BASE_URL}`);
  console.log(` Time:   ${new Date().toISOString()}`);
  console.log('════════════════════════════════════════════════════════\n');

  for (const handle of PILOT_HANDLES) {
    console.log(`▶ ${handle}`);
    try {
      const res = await fetch(`${BASE_URL}/api/enrich/${handle}`, {
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        console.log(`  [ERROR] ${res.status} ${res.statusText}\n`);
        continue;
      }
      const card = await res.json() as {
        github_handle?: string;
        summary?: string | null;
        signals?: { type: string; label: string; url: string }[];
        error?: string;
      };

      if (card.error === 'unavailable' || !card.summary) {
        console.log('  [DEGRADED] enrichment unavailable\n');
        continue;
      }

      const signalCount = card.signals?.length ?? 0;
      const hasRepoUrl = /github\.com\/[^\s]+\/[^\s]+/.test(card.summary);

      console.log(`  Signals: ${signalCount}`);
      console.log(`  Repo URL cited in summary: ${hasRepoUrl ? '✓' : '✗'}`);
      console.log(`  Summary:\n${card.summary?.split('\n').map(l => '    ' + l).join('\n')}`);
      console.log(`\n  Manual checks:`);
      console.log(`    [ ] mentions code quality (error handling / tests / structure / maintenance)`);
      console.log(`    [ ] cites a specific repo URL`);
      console.log(`    [ ] signals array populated`);
      console.log('');
    } catch (err) {
      console.log(`  [FETCH ERROR] ${err}\n`);
    }
  }

  console.log('════════════════════════════════════════════════════════');
  console.log(' If ≥2 of 3 pilot subjects fail manual checks: revert Change 3.');
  console.log('════════════════════════════════════════════════════════\n');
}

if (process.env.EVAL_PILOT === '1') {
  runEnrichPilot().catch(console.error);
}
