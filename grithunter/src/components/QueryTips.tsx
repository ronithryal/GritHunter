import React, { useState } from 'react';

const EXAMPLES = [
  'React Native engineers who shipped App Store apps',
  'contributors to the TypeScript compiler or language tooling',
  'engineers who built open-source developer tools in Go',
  'Python ML engineers who publish research code on GitHub',
  'authors of widely-used Rust async or systems libraries',
  'engineers who maintain Kubernetes operators or Helm charts',
];

const REPHRASES = [
  {
    bad: '"devs who can scale apps to millions"',
    good: '"engineers who maintain Kubernetes operators or wrote cloud-native infra tooling"',
  },
  {
    bad: '"senior React engineers good at architecture"',
    good: '"React engineers who authored widely-used component libraries or state management tools"',
  },
  {
    bad: '"DevOps with distributed systems experience"',
    good: '"contributors to Temporal, Kafka, etcd, NATS, or similar infra tools"',
  },
];

interface QueryTipsProps {
  onExampleClick: (query: string) => void;
}

export function QueryTips({ onExampleClick }: QueryTipsProps) {
  const [showRephrase, setShowRephrase] = useState(false);

  return (
    <div className="w-full mt-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
        Example queries
      </p>
      <ul className="flex flex-col gap-2">
        {EXAMPLES.map((ex) => (
          <li key={ex}>
            <button
              onClick={() => onExampleClick(ex)}
              className="text-sm text-left text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
            >
              <span className="text-zinc-300 dark:text-zinc-600 mr-2">→</span>
              {ex}
            </button>
          </li>
        ))}
      </ul>

      <button
        onClick={() => setShowRephrase((v) => !v)}
        className="mt-6 text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors underline underline-offset-2"
      >
        {showRephrase ? 'Hide tips' : 'How to write better queries'}
      </button>

      {showRephrase && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            GritHunter reasons over public work — repos, packages, talks, contributions.
            Describe <strong>what they built</strong>, not what they&apos;ve experienced.
            If the skill doesn&apos;t leave a public artifact, rephrase until it does.
          </p>
          <div className="space-y-3">
            {REPHRASES.map((r, i) => (
              <div key={i} className="text-xs space-y-1">
                <p className="text-zinc-400 dark:text-zinc-500 line-through">{r.bad}</p>
                <p className="text-zinc-700 dark:text-zinc-300">{r.good}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
            Location filters (e.g. &quot;in SF&quot;) often return few results — top engineers
            in most domains are globally distributed. Search without location first,
            then filter manually.
          </p>
        </div>
      )}
    </div>
  );
}
