/**
 * The bundled run (21 Oct 2026, 4:55 PM) and digest enrichment. A pasted run with the same case IDs gets the same
 * digest-only fields; other runs keep what their own text says.
 */
import { RUN_DIGEST, RUN_FIXTURE_SOURCE, RUN_FIXTURE_TEXT } from './fixture.data.ts';
import { usdInText } from './fx.ts';
import { parseRun } from './parse.ts';
import { withoutSourceOnly } from './sanitize.ts';
import type { Run } from './types.ts';

/** Adds the digest's meta and findings (sanitized; euro amounts shown as USD at the cut-day rate). */
export function enrich(run: Run, digest: Record<string, { meta: string; findings: string[] }> = RUN_DIGEST): Run {
  return {
    ...run,
    cases: run.cases.map((c) => {
      const d = digest[c.caseId];
      if (!d) return c;
      const day = c.disconnectedAt?.slice(0, 10) ?? null;
      return {
        ...c,
        meta: d.meta,
        region: d.meta.split('·').pop()?.trim() || null,
        findings: d.findings.map((f) => usdInText(withoutSourceOnly(f), day)).filter(Boolean),
      };
    }),
  };
}

export const BUNDLED_RUN_ID = 'run-2026-10-21-1655';

export const bundledRun = (): Run =>
  enrich(
    parseRun(RUN_FIXTURE_TEXT, {
      id: BUNDLED_RUN_ID,
      label: 'The Pitt run · 21 Oct 2026, 4:55 PM',
      source: RUN_FIXTURE_SOURCE,
      importedAt: '2026-10-21T16:55:00',
    }),
  );
