/**
 * What the product shows from source text. RPMBr / RPMA analysis, priority scores and confidence are not displayed or
 * analysed; they stay in the stored raw source only. STR publishers are excluded. Text is always treated as data.
 */

/** Lines and clauses that exist only in the stored source. */
export const SOURCE_ONLY = /\bRPMB?R\b|\bRPMA\b|\brpmbr\b|priority score|\bconfidence\b/i;

/** Networks being sunset carry "STR" as a separate word (same rule as the n8n main workflow). */
export const isStr = (name: string) => /(^|\s)STR(\s|$)/.test(name);

/** Split prose into sentences without breaking decimals ("€12.07") or abbreviations like "vs.". */
const sentences = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z[(])/);

/**
 * Removes the RPMBr part of a sentence and keeps the rest:
 * "Likely an intended cut under TOPS-11471, with seat 437 RPMBR at €28.78 against a €44.53 bar." →
 * "Likely an intended cut under TOPS-11471."
 */
export function withoutSourceOnly(text: string): string {
  const out: string[] = [];
  for (const s of sentences(text.trim())) {
    if (!SOURCE_ONLY.test(s)) {
      out.push(s);
      continue;
    }
    const end = /[.!?]$/.test(s) ? s.slice(-1) : '';
    const body = end ? s.slice(0, -1) : s;
    // Clauses are separated by ", " / "; " / " and " (keep the separator with the clause that follows it).
    const parts = body.split(/(,\s+|;\s+|\s+and\s+)/);
    const kept: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
      const clause = parts[i];
      const sep = i > 0 ? parts[i - 1] : '';
      if (!SOURCE_ONLY.test(clause)) kept.push((kept.length ? sep : '') + clause);
    }
    const rest = kept.join('').trim();
    if (rest && rest.split(/\s+/).length >= 3) out.push(rest + (end || '.'));
  }
  return out.join(' ').trim();
}

/** True when an action's whole purpose is RPMBr analysis (its observation or step is about RPMBr / RPMA). */
export const isSourceOnlyAction = (observation: string, nextStep: string | null) =>
  SOURCE_ONLY.test(observation) || /RPMA threshold/i.test(nextStep ?? '');

/** Next steps can justify themselves with RPMBr ("…so they lift RPMBR."): drop that tail, keep the ask. */
export const stepWithoutSourceOnly = (step: string | null) => (step ? withoutSourceOnly(step.replace(/:\s+[^:]*\bRPMB?R\b[^.]*\./i, '.')) || null : null);
