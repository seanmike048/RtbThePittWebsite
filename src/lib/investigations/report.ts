/**
 * Parser for The Pitt workflow output ("THE PITT | APPROVED INVESTIGATION" text).
 * The text is kept verbatim; parsing only structures it for display. Nothing here changes a field's meaning.
 */

export type CheckResult = 'PASS' | 'FAIL' | 'NO_DATA' | string;

export interface ReportAction {
  team: string;
  owner: string;
  ownerIsPerson: boolean;
  text: string;
  confidence: string | null;
}

export interface InvestigationReport {
  status: string;
  network: string;
  networkId: string;
  dsp: string;
  disconnectedOn: string;
  priority: string;
  summary: { label: string; value: string }[];
  revenue7d: { amount: number | null; note: string | null };
  checks: { name: string; result: CheckResult }[];
  evidenceConfidence: string | null;
  rootCauseConfidence: string | null;
  exactReason: string | null;
  leadingHypothesis: string | null;
  actions: ReportAction[];
  publisherDraft: { reviewer: string | null; text: string } | null;
  approval: string | null;
  /** Structured flags, only when the text states them; null means the text does not say. */
  meta: {
    /** Time as written ("08:11"); never given a zone the text does not state. */
    disconnectedTime: string | null;
    timezone: string | null;
    /** ISO code or symbol only if the text names one; "unverified" wording keeps this null. */
    revenueCurrency: string | null;
    revenueCurrencyStated: boolean;
    hypothesisConfirmed: boolean | null;
    approvalCompleted: boolean | null;
    externalMessageSent: boolean | null;
    draftSent: boolean | null;
    seatCount: number | null;
  };
  raw: string;
}

/** Markdown links keep their text; emphasis and heading markers go. The raw payload is kept separately, unchanged. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*|__/g, '')
    .replace(/[ \t]*(EXECUTIVE SUMMARY|RECOMMENDED INTERNAL ACTIONS)[ \t:]*/g, '\n$1\n')
    .replace(/[ \t]*(LEADING HYPOTHESIS(?:[ \t]*[—–-][ \t]*NOT A CONFIRMED CAUSE)?)[ \t:]*/g, '\n$1\n')
    .replace(/[ \t]*(PUBLISHER COMMUNICATION(?:[ \t]*[—–-][ \t]*DRAFT ONLY,?[ \t]*NOT SENT)?)[ \t:]*/g, '\n$1\n')
    .replace(/[ \t]+•[ \t]*/g, '\n• ')
    .replace(/[ \t]*(Human approval completed\.)/g, '\n$1');
}

const TZ = /\b(UTC|GMT|CET|CEST|EST|EDT|PST|PDT|Z|[+-]\d{2}:\d{2})\b/;
const CURRENCY = /(?:\b(EUR|USD|GBP|JPY|CAD|AUD)\b|([€$£¥]))/;

const SECTION = /^(EXECUTIVE SUMMARY|LEADING HYPOTHESIS.*|RECOMMENDED INTERNAL ACTIONS|PUBLISHER COMMUNICATION.*)$/i;

export function parseInvestigation(raw: string): InvestigationReport {
  const text = normalizeText(raw);
  const lines = text.split('\n').map(l => l.trim());
  const sections: Record<string, string[]> = { head: [] };
  let current = 'head';
  const headings: string[] = [];
  for (const l of lines) {
    const m = l.match(SECTION);
    if (m) {
      headings.push(m[1]);
      current = m[1].toUpperCase().startsWith('LEADING')
        ? 'hypothesis'
        : m[1].toUpperCase().startsWith('PUBLISHER')
          ? 'draft'
          : m[1].toUpperCase().startsWith('RECOMMENDED')
            ? 'actions'
            : 'summary';
      sections[current] = [];
      continue;
    }
    (sections[current] ??= []).push(l);
  }

  const head = sections.head.filter(Boolean);
  const status = head.find(l => /THE PITT/i.test(l))?.split('|').slice(1).join('|').trim() ?? '';
  const idLine = head.find(l => /Network #/i.test(l)) ?? '';
  const idParts = idLine.split('|').map(s => s.trim());
  const network = idParts[0] ?? '';
  const networkId = idLine.match(/Network #(\d+)/i)?.[1] ?? '';
  const dsp = idParts[2] ?? '';
  const metaLine = head.find(l => /Disconnected:/i.test(l)) ?? '';
  const disconnectedOn = metaLine.match(/Disconnected:\s*([^|]+)/i)?.[1].trim() ?? '';
  const priority = metaLine.match(/Priority:\s*([^|]+)/i)?.[1].trim() ?? '';

  const summary = (sections.summary ?? [])
    .filter(l => l.startsWith('•'))
    .map(l => {
      const body = l.replace(/^•\s*/, '');
      const i = body.indexOf(':');
      return i < 0 ? { label: body, value: '' } : { label: body.slice(0, i).trim(), value: body.slice(i + 1).trim() };
    });
  const find = (re: RegExp) => summary.find(s => re.test(s.label))?.value ?? null;

  const revenueRaw = find(/revenue/i);
  const revMatch = revenueRaw?.match(/^([\d,.]+)\s*(?:\((.*)\))?/);
  const checksRaw = find(/quality checks/i) ?? '';
  const checks = checksRaw
    .split('|')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const [name, result] = s.split(':').map(x => x.trim());
      return { name, result: (result ?? '').toUpperCase() };
    });

  const hypothesis = (sections.hypothesis ?? []).filter(Boolean).join(' ') || null;

  // Actions: "Team → owner" header lines followed by paragraph text.
  const actions: ReportAction[] = [];
  for (const l of sections.actions ?? []) {
    const h = l.match(/^(.+?)\s*(?:→|->)\s*(.+)$/);
    if (h) {
      const owner = h[2].trim();
      actions.push({ team: h[1].trim(), owner, ownerIsPerson: /@/.test(owner), text: '', confidence: null });
    } else if (l && actions.length) {
      const a = actions[actions.length - 1];
      a.text = (a.text ? `${a.text} ` : '') + l;
    }
  }
  for (const a of actions) {
    const c = a.text.match(/Confidence:\s*([A-Za-z]+)\.?\s*$/i);
    if (c) {
      a.confidence = c[1].toLowerCase();
      a.text = a.text.slice(0, c.index).trim();
    }
  }

  const draftLines = (sections.draft ?? []).filter(Boolean);
  const approvalIdx = draftLines.findIndex(l => /approval/i.test(l));
  const approval = approvalIdx >= 0 ? draftLines.slice(approvalIdx).join(' ') : null;
  const body = (approvalIdx >= 0 ? draftLines.slice(0, approvalIdx) : draftLines).join(' ');
  const rv = body.match(/^For\s+(\S+)\s+to review:\s*/i);
  const publisherDraft = body ? { reviewer: rv?.[1] ?? null, text: rv ? body.slice(rv[0].length).trim() : body } : null;

  const actionText = actions.map(a => a.text).join(' ');
  const timeMatch = actionText.match(new RegExp(`${disconnectedOn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+at\\s+(\\d{1,2}:\\d{2})(?:\\s*${TZ.source})?`));
  const currencyMatch = revenueRaw?.match(CURRENCY);
  const seats = actionText.match(/disconnected\s+(\d+)\s+(?:partner\s+)?seats/i);
  const hypHeading = headings.find(h => /^LEADING/i.test(h)) ?? '';
  const draftHeading = headings.find(h => /^PUBLISHER/i.test(h)) ?? '';
  const meta: InvestigationReport['meta'] = {
    disconnectedTime: timeMatch?.[1] ?? null,
    timezone: timeMatch?.[2] ?? null,
    revenueCurrency: currencyMatch ? (currencyMatch[1] ?? currencyMatch[2]) : null,
    revenueCurrencyStated: !!currencyMatch && !/unverified/i.test(revenueRaw ?? ''),
    hypothesisConfirmed: /NOT A CONFIRMED CAUSE/i.test(hypHeading) ? false : null,
    approvalCompleted: approval ? /approval completed/i.test(approval) : null,
    externalMessageSent: approval ? (/no external .*message was sent/i.test(approval) ? false : null) : null,
    draftSent: /NOT SENT/i.test(draftHeading) ? false : null,
    seatCount: seats ? Number(seats[1]) : null,
  };

  return {
    status,
    network,
    networkId,
    dsp,
    disconnectedOn,
    priority,
    summary,
    revenue7d: { amount: revMatch ? Number(revMatch[1].replace(/,/g, '')) : null, note: revMatch?.[2] ?? null },
    checks,
    evidenceConfidence: find(/evidence confidence/i),
    rootCauseConfidence: find(/root-?cause confidence/i),
    exactReason: find(/exact .*reason/i),
    leadingHypothesis: hypothesis,
    actions,
    publisherDraft,
    approval,
    meta,
    raw: raw,
  };
}
