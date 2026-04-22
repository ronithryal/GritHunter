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
  /** Mode to use: 'search' | 'similar' */
  mode?: 'search' | 'similar';
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
    mode: 'similar',
    minResults: 3,
  },
  {
    label: 'Profile similarity — brentvatne',
    query: 'https://github.com/brentvatne',
    mode: 'similar',
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
