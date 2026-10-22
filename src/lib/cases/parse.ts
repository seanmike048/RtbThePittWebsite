/**
 * Imports a complete copied Slack / n8n output of The Pitt into a Run.
 *
 * Only two shapes count as content: the run headline ("3 publishers · …") and The Pitt Jira drafts, from their
 * "[The Pitt] <publisher> (<network>) disconnected from <DSP>" header to the "Case LIVE-…" footer. Everything else
 * (Slack chrome, link previews, website descriptions, unrelated messages) is counted and ignored, never used as evidence.
 * Pasted text is data: nothing in it is executed or followed.
 */
import { isSourceOnlyAction, isStr, SOURCE_ONLY, stepWithoutSourceOnly, withoutSourceOnly } from './sanitize.ts';
import type { CaseAction, CaseRecord, ContextTicket, ImportReport, Run, RunContext, SourceMoney } from './types.ts';

/** Non-cryptographic content hash (FNV-1a, 32 bit) for provenance and de-duplication. */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'fnv1a-' + h.toString(16).padStart(8, '0');
}

/** Normalizes Slack copy: line endings, invisible characters, link markup, emphasis, bullets and arrows. */
export function normalizeSlack(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/ /g, ' ')
    .replace(/<(https?:\/\/[^|>\s]+)\|([^>]+)>/g, '$2') // <url|label> → label
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,:;!?)]|$)/g, '$1$2') // *bold*
    .replace(/(^|\s)_([^_\n]+)_(?=\s|[.,:;!?)]|$)/g, '$1$2') // _italic_
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/:[a-z0-9_+-]+:/g, '') // :emoji:
    .replace(/^[ \t]*[◦▪●–-][ \t]+(?=\[)/gm, '• ') // bullet variants before a [Team] tag
    .replace(/\s*(?:->|=>|⟶)\s*/g, ' → ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

const HEADER = /^\[The Pitt\]\s+(.+?)\s+\((\d+)\)\s+disconnected from\s+(.+?)(?:\s+·\s+.*)?$/;
const FOOTER = /Case\s+(LIVE-\d+-[a-z0-9_]+)\.?\s*$/;
const HEADLINE = /^\s*(\d+)\s+publishers?\s+·\s+.+before the cut/i;
const TICKET = /\b(?:TOPS|BS|PLD|SUP|OPS)-\d+\b/g;
const PERSON = /\b(?:Ask|ask|with|align with|Confirm with|confirm with)\s+((?:[A-Z][a-z\u00e0-\u00ff\u0100-\u017f]+(?:[-\s][A-Z][a-z\u00e0-\u00ff\u0100-\u017f]+)+))/g;

interface Block {
  header: RegExpMatchArray;
  lines: string[];
  caseId: string | null;
}

/** Splits the normalized text into draft blocks; returns the blocks and the lines outside any block. */
function blocks(text: string): { blocks: Block[]; outside: string[] } {
  const out: Block[] = [];
  const outside: string[] = [];
  let cur: Block | null = null;
  for (const line of text.split('\n')) {
    const h = line.trim().match(HEADER);
    if (h) {
      cur = { header: h, lines: [line], caseId: null };
      out.push(cur);
      continue;
    }
    if (cur) {
      cur.lines.push(line);
      const f = line.trim().match(FOOTER);
      if (f) {
        cur.caseId = f[1];
        cur = null;
      }
      continue;
    }
    if (line.trim()) outside.push(line);
  }
  return { blocks: out, outside };
}

const field = (lines: string[], label: string) => {
  const l = lines.find((x) => x.trim().startsWith(label + ':'));
  return l ? l.trim().slice(label.length + 1).trim() : null;
};

const section = (lines: string[], start: RegExp, end: RegExp) => {
  const i = lines.findIndex((l) => start.test(l.trim()));
  if (i < 0) return [];
  const rest = lines.slice(i + 1);
  const j = rest.findIndex((l) => end.test(l.trim()));
  return j < 0 ? rest : rest.slice(0, j);
};

function money(spend: string | null): SourceMoney | null {
  if (!spend) return null;
  const m = spend.match(/([€$])\s?(\d[\d,]*(?:\.\d+)?)/);
  if (!m) return null;
  // The draft says "currency not documented"; the measure behind the alert view is documented as EUR in Snowflake.
  const currency = m[1] === '$' ? 'USD' : 'EUR';
  return { amount: Number(m[2].replace(/,/g, '')), currency, basis: /per week/i.test(spend) ? 'per week before the cut' : 'as stated' };
}

function actionsOf(lines: string[], caseId: string, holdsContact: boolean, sourceOnly: string[]): CaseAction[] {
  const items = section(lines, /^Open items$/i, /^Internal research|^Leading hypothesis/i);
  const out: CaseAction[] = [];
  let cur: { team: string; obs: string; step: string | null } | null = null;
  const flush = () => {
    if (!cur) return;
    if (isSourceOnlyAction(cur.obs, cur.step)) {
      sourceOnly.push(`[${cur.team}] ${cur.obs}${cur.step ? ' → ' + cur.step : ''}`);
    } else {
      const step = stepWithoutSourceOnly(cur.step);
      const text = cur.obs + ' ' + (cur.step ?? '');
      const team = cur.team;
      out.push({
        id: caseId + '#' + (out.length + 1),
        team,
        observation: withoutSourceOnly(cur.obs) || cur.obs,
        nextStep: step,
        contacts: [...new Set([...(step ?? '').matchAll(PERSON)].map((m) => m[1]))],
        tickets: [...new Set(text.match(TICKET) ?? [])],
        status: 'Open',
        publisherContact: holdsContact && /publisher|KAM/i.test(team) ? 'Held until TechOps confirms' : 'Internal action',
        source: 'Jira draft · Open items',
      });
    }
    cur = null;
  };
  for (const raw of items) {
    const l = raw.trim();
    const b = l.match(/^•\s*\[([^\]]+)\]\s*(.+)$/);
    if (b) {
      flush();
      cur = { team: b[1].trim(), obs: b[2].trim(), step: null };
    } else if (cur && /^Next step:/i.test(l)) {
      cur.step = l.replace(/^Next step:\s*/i, '');
    } else if (cur && l) {
      if (cur.step == null) cur.obs += ' ' + l;
      else cur.step += ' ' + l;
    }
  }
  flush();
  // De-duplicate repeated items inside one draft.
  const seen = new Set<string>();
  return out.filter((a) => {
    const k = (a.team + '|' + a.observation + '|' + a.nextStep).toLowerCase();
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

function contextOf(lines: string[]): ContextTicket[] {
  const rows = section(lines, /^Internal research/i, /^These sources|^Leading hypothesis/i);
  const out: ContextTicket[] = [];
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i].trim().match(/^\*\s*([A-Z]+-\d+)\s*(?:\((\d{4}-\d{2}-\d{2})\))?\s*(?:—\s*(.+))?$/);
    if (m) out.push({ key: m[1], date: m[2] ?? null, scope: m[3]?.replace(/_/g, ' ') ?? null, summary: (rows[i + 1] ?? '').trim() });
  }
  return out;
}

function caseOf(b: Block, holdsContact: boolean): CaseRecord {
  const [, publisher, net, dsp] = b.header;
  const lines = b.lines;
  const raw = lines.join('\n').trim();
  const networkId = Number(net);
  const partner = field(lines, 'Demand partner');
  const disconnectedAt = partner?.match(/disconnected\s+(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)/)?.[1] ?? null;
  const dspName = (partner?.split('·')[0].trim() || dsp.trim()).replace(/\s+·.*$/, '');
  const caseId = b.caseId ?? `LIVE-${networkId}-${dspName.toLowerCase().replace(/\s+/g, '_')}`;
  const sourceOnly: string[] = lines.filter((l) => SOURCE_ONLY.test(l) && !/^•/.test(l.trim()) && !/^Next step/i.test(l.trim())).map((l) => l.trim());
  const read = field(lines, 'Read');
  const hypLines = section(lines, /^Leading hypothesis/i, /^Generated by/i).map((l) => l.trim()).filter(Boolean);
  const verify = hypLines.find((l) => /^Verify:/i.test(l))?.replace(/^Verify:\s*/i, '') ?? null;
  const hyp = hypLines.find((l) => !/^Verify:/i.test(l)) ?? null;
  const actions = actionsOf(lines, caseId, holdsContact, sourceOnly);
  const all = raw.replace(/\s+/g, ' ');
  const distinctions = [
    /is named in (TOPS-\d+)/i.test(all) && `Named in ${all.match(/is named in (TOPS-\d+)/i)![1]}`,
    /above (?:the )?wave[- ]1 cutoff/i.test(all) && 'Above the wave-1 cutoff',
  ].filter(Boolean) as string[];
  const pending = /\b(confirm|ask)\b[^.]*\b(Jaroslaw|Jarosław|TechOps|TOPS-\d+)/i.test(all);
  return {
    caseId,
    identity: [publisher, networkId, dspName, disconnectedAt ?? 'unknown cut'].join(' · '),
    publisher,
    networkId,
    dsp: dspName,
    disconnectedAt,
    meta: null,
    region: null,
    sourceSpend: money(field(lines, 'Spend at stake')),
    status: pending ? 'Pending TechOps confirmation' : 'Open',
    distinctions,
    publisherContactHeld: holdsContact || /before (?:anyone )?contact(?:s|ing)? the publisher/i.test(all),
    summary: read ? withoutSourceOnly(read) || null : null,
    findings: [],
    hypothesis: hyp ? { text: hyp, verify } : null,
    actions,
    context: contextOf(lines),
    drafts: { state: 'Draft only', jira: 'Not created', copies: 1 },
    provenance: { raw, hash: contentHash(raw), sourceOnly: [...new Set(sourceOnly)] },
  };
}

function runContext(text: string, holdsContact: boolean): RunContext {
  const line = text.split('\n').find((l) => HEADLINE.test(l))?.trim() ?? null;
  const notes: string[] = [];
  if (line) {
    const wave = line.match(/Next:\s*(.+?)(?:\.|$)/);
    if (wave) notes.push(wave[1].trim());
    const split = line.match(/:\s*(\d+ named in the ticket, \d+ above wave-1 cutoff[^.]*)/);
    if (split) notes.push(split[1].trim());
  }
  return {
    headline: line,
    publishers: line ? Number(line.match(HEADLINE)![1]) : null,
    tickets: [...new Set(line?.match(TICKET) ?? [])],
    notes,
    jira: 'Drafts generated · no ticket created',
    publisherContact: holdsContact ? 'Held until TechOps confirms' : 'No hold stated',
  };
}

/** Parses a full paste. Unknown text produces warnings, never cases. */
export function parseRun(input: string, opts: { id?: string; label?: string; source?: string; importedAt?: string } = {}): Run {
  const text = normalizeSlack(input);
  const { blocks: bs, outside } = blocks(text);
  const holdsContact = /before (?:anyone )?contact(?:s|ing)? the publisher|publisher communication(?:s)? must wait|before any reconnection request/i.test(text);
  const warnings: string[] = [];
  const excluded: string[] = [];
  const byId = new Map<string, CaseRecord>();
  let duplicates = 0;

  for (const b of bs) {
    if (!b.caseId) warnings.push(`A draft for ${b.header[1]} (${b.header[2]}) has no "Case LIVE-…" footer; it was identified by publisher, network, DSP and cut time.`);
    const c = caseOf(b, holdsContact);
    if (isStr(c.publisher)) {
      if (!excluded.includes(c.publisher)) excluded.push(c.publisher);
      continue;
    }
    const prev = byId.get(c.caseId);
    if (prev) {
      duplicates++;
      if (prev.provenance.hash !== c.provenance.hash) {
        warnings.push(`Two different drafts for ${c.caseId}; the longer one is kept.`);
        if (c.provenance.raw.length > prev.provenance.raw.length) byId.set(c.caseId, { ...c, drafts: { ...c.drafts, copies: prev.drafts.copies + 1 } });
        else prev.drafts.copies++;
      } else prev.drafts.copies++;
      continue;
    }
    byId.set(c.caseId, c);
  }

  const context = runContext(text, holdsContact);
  const ignored = outside.filter((l) => !HEADLINE.test(l)).length;
  if (!bs.length) warnings.push('No The Pitt draft was found. Paste the full output, including the "[The Pitt] … disconnected from …" drafts.');
  if (context.publishers != null && context.publishers !== byId.size + excluded.length)
    warnings.push(`The headline says ${context.publishers} publishers; ${byId.size} case(s) were found.`);
  if (excluded.length) warnings.push(`Excluded STR publisher(s): ${excluded.join(', ')}.`);
  const cases = [...byId.values()];
  const report: ImportReport = {
    cases: cases.length,
    actions: cases.reduce((a, c) => a + c.actions.length, 0),
    drafts: bs.length,
    duplicatesRemoved: duplicates,
    sourceOnlyLines: cases.reduce((a, c) => a + c.provenance.sourceOnly.length, 0),
    ignoredLines: ignored,
    excluded,
    warnings,
  };
  const hash = contentHash(text);
  return {
    id: opts.id ?? 'import-' + hash.slice(6),
    label: opts.label ?? 'Imported run',
    source: opts.source ?? 'Pasted Slack / n8n output',
    importedAt: opts.importedAt ?? new Date().toISOString(),
    hash,
    context,
    cases,
    report,
  };
}
