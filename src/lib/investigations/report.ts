/**
 * Parser for The Pitt workflow output. Two formats are read:
 * - the approved narrative ("THE PITT | APPROVED INVESTIGATION" text);
 * - the Investigator v4.6 Slack card built by node "15 Final Report" ("THE PITT | <network> · Network #<id> · <DSP>").
 * The text is kept verbatim; parsing only structures it for display. Nothing here changes a field's meaning.
 */

export type CheckResult = 'PASS' | 'FAIL' | 'NO_DATA' | string;

export interface ActionItem {
  /** The open item as written (seat, status, share, inventory). */
  signal: string;
  /** The "↳" next step under it, when the card gives one. */
  next: string | null;
}

export interface ReportAction {
  team: string;
  owner: string;
  ownerIsPerson: boolean;
  text: string;
  confidence: string | null;
  /** v4.6 card only: one entry per open item; empty for the narrative format. */
  items: ActionItem[];
}

/** "RPMBr before the cut" line of the v4.6 card; values as written, never recomputed. */
export interface RpmbrLine {
  /** Per million bid requests sent to the partner's seats; null when the card says n/a. */
  partner: number | null;
  /** Same measure for the whole network, all DSPs. */
  network: number | null;
  /** Taken from the card's own currency statement on the spend line, never from a symbol alone. */
  currency: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  /** Revenue measure named on the line, e.g. "gross exchange price". */
  basis: string | null;
  text: string;
}

export interface InvestigationReport {
  format: 'narrative' | 'v4.6-card';
  status: string;
  network: string;
  networkId: string;
  dsp: string;
  disconnectedOn: string;
  priority: string;
  summary: { label: string; value: string }[];
  revenue7d: { amount: number | null; note: string | null };
  rpmbr: RpmbrLine | null;
  checks: { name: string; result: CheckResult }[];
  evidenceConfidence: string | null;
  rootCauseConfidence: string | null;
  exactReason: string | null;
  leadingHypothesis: string | null;
  actions: ReportAction[];
  publisherDraft: { reviewer: string | null; text: string } | null;
  approval: string | null;
  /** Warning lines the card itself carries (unsupported numbers, AI unavailable, omitted detail). */
  warnings: string[];
  /** Structured flags, only when the text states them; null means the text does not say. */
  meta: {
    /** Time as written ("08:11"); never given a zone the text does not state. */
    disconnectedTime: string | null;
    timezone: string | null;
    /** ISO code or symbol only if the text names one; "unverified" wording keeps this null. */
    revenueCurrency: string | null;
    revenueCurrencyStated: boolean;
    /** Qualifier written next to the currency, e.g. "source-documented, not Finance-validated". */
    revenueCurrencyStatus: string | null;
    hypothesisConfirmed: boolean | null;
    hypothesisLikelihood: string | null;
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
  return isCard(raw) ? parseCard(raw) : parseNarrative(raw);
}

function parseNarrative(raw: string): InvestigationReport {
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
      actions.push({ team: h[1].trim(), owner, ownerIsPerson: /@/.test(owner), text: '', confidence: null, items: [] });
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
    revenueCurrencyStatus: null,
    hypothesisConfirmed: /NOT A CONFIRMED CAUSE/i.test(hypHeading) ? false : null,
    hypothesisLikelihood: null,
    approvalCompleted: approval ? /approval completed/i.test(approval) : null,
    externalMessageSent: approval ? (/no external .*message was sent/i.test(approval) ? false : null) : null,
    draftSent: /NOT SENT/i.test(draftHeading) ? false : null,
    seatCount: seats ? Number(seats[1]) : null,
  };

  return {
    format: 'narrative',
    status,
    network,
    networkId,
    dsp,
    disconnectedOn,
    priority,
    summary,
    revenue7d: { amount: revMatch ? Number(revMatch[1].replace(/,/g, '')) : null, note: revMatch?.[2] ?? null },
    rpmbr: null,
    checks,
    evidenceConfidence: find(/evidence confidence/i),
    rootCauseConfidence: find(/root-?cause confidence/i),
    exactReason: find(/exact .*reason/i),
    leadingHypothesis: hypothesis,
    actions,
    publisherDraft,
    approval,
    warnings: [],
    meta,
    raw: raw,
  };
}

/* ---------------- Investigator v4.6 card (node "15 Final Report") ---------------- */

const CARD_HEAD = /^THE PITT \|\s*(.+?)\s+·\s+Network #(\d+)\s+·\s+(.+?)$/;

/**
 * Slack mrkdwn as node 15 writes it (*bold*, _italic_, :emoji: shortcodes). Text copied out of Slack is already
 * rendered, so every step is optional. The raw payload is kept separately, unchanged.
 */
function normalizeCard(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,;:])/gm, '$1$2')
    .replace(/:(?:white_check_mark|warning|pencil2):\s*/g, '')
    .replace(/(?:✅|⚠|✏)️?\s*/g, '');
}

export function isCard(raw: string): boolean {
  return normalizeCard(raw)
    .split('\n')
    .some(l => CARD_HEAD.test(l.trim()));
}

const TEAMS: Record<string, string> = { TECHOPS: 'TechOps', 'PUBLISHER KAM': 'Publisher KAM', PARTNERSHIPS: 'Partnerships' };
const TEAM_HEAD = /^([A-Z][A-Z ]*[A-Z])(?:\s*(?:→|->)\s*(.+))?$/;
const CHECK_NAMES: Record<string, string> = { 'ads.txt': 'ads_txt', 'supply chain': 'sco', 'blocked inventory': 'blocked_inventory', ivt: 'ivt' };
const CARD_WARNING = /^(AI investigation unavailable:|Numbers not found in the evidence:|Some detail omitted|\.\.\. \[truncated)/i;
const num = (s: string | undefined) => (s === undefined ? null : Number(s.replace(/,/g, '')));

function parseCard(raw: string): InvestigationReport {
  const lines = normalizeCard(raw)
    .split('\n')
    .map(l => l.trim());
  type Section = 'head' | 'summary' | 'seats' | 'team' | 'claims' | 'other';
  let section: Section = 'head';
  const head: string[] = [];
  const bullets: string[] = [];
  const actions: ReportAction[] = [];
  const warnings: string[] = [];
  const draft: string[] = [];
  let draftTeam: ReportAction | null = null;
  let draftNotSent = false;
  let hypothesis: string | null = null;
  let hypothesisTags = '';

  for (const l of lines) {
    if (!l) {
      if (section !== 'head' || head.length) section = 'other';
      continue;
    }
    if (CARD_WARNING.test(l)) {
      warnings.push(l);
      continue;
    }
    if (/^EXECUTIVE SUMMARY$/.test(l)) {
      section = 'summary';
      continue;
    }
    if (/^SEATS BEFORE THE CUT\b/.test(l)) {
      section = 'seats';
      continue;
    }
    if (/^CLAIMS CHECKED$/.test(l)) {
      section = 'claims';
      continue;
    }
    const hyp = l.match(/^Leading hypothesis\s*\(([^)]*)\):\s*(.+)$/i);
    if (hyp) {
      hypothesisTags = hyp[1];
      hypothesis = hyp[2].trim();
      section = 'other';
      continue;
    }
    const team = section !== 'head' ? l.match(TEAM_HEAD) : null;
    if (team && (TEAMS[team[1]] || team[2])) {
      const owner = team[2]?.trim() ?? '';
      actions.push({ team: TEAMS[team[1]] ?? team[1], owner, ownerIsPerson: /@/.test(owner), text: '', confidence: null, items: [] });
      section = 'team';
      continue;
    }
    if (section === 'head') head.push(l);
    else if (section === 'summary' && l.startsWith('•')) bullets.push(l.replace(/^•\s*/, ''));
    else if (section === 'team') {
      const a = actions[actions.length - 1];
      if (/^Message to the publisher\b/i.test(l)) {
        draftTeam = a;
        draftNotSent = /not sent/i.test(l);
      } else if (l.startsWith('>')) draft.push(l.replace(/^>\s?/, ''));
      else if (l.startsWith('•')) a.items.push({ signal: l.replace(/^•\s*/, ''), next: null });
      else if (l.startsWith('↳') && a.items.length) a.items[a.items.length - 1].next = l.replace(/^↳\s*/, '');
    }
  }

  // Header: "THE PITT | <network> · Network #<id> · <DSP>", then "Disconnected <date> <time> · Priority <p> · <status>".
  const id = head.map(l => l.match(CARD_HEAD)).find(Boolean);
  const metaParts = (head.find(l => /^Disconnected\b/i.test(l)) ?? '').split(/\s+·\s+/);
  const when = metaParts[0]?.match(/^Disconnected\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?(?:\s*(\S+))?/i);
  const tz = when?.[3]?.match(TZ)?.[1] ?? null;
  const priority = metaParts.find(p => /^Priority\b/i.test(p))?.replace(/^Priority\s*/i, '').trim() ?? '';
  const status = metaParts.length > 1 && !/^Priority\b/i.test(metaParts[metaParts.length - 1]) ? metaParts[metaParts.length - 1] : '';

  const summary = bullets.map(b => {
    const i = b.indexOf(':');
    return i < 0 ? { label: b, value: '' } : { label: b.slice(0, i).trim(), value: b.slice(i + 1).trim() };
  });
  const find = (re: RegExp) => summary.find(s => re.test(s.label))?.value ?? null;

  // Spend line: "€16,037 per week of <DSP> spend before the cut (<source> · EUR, <status>); about …".
  // Node 15 prints "€" whatever the source, so the currency is read only from the words in the parentheses.
  const spend = find(/^spend at stake/i);
  const amount = spend?.match(/^[€$£¥]?\s*([\d,.]+)/)?.[1];
  const note = spend?.match(/\(([^)]*)\)/)?.[1].trim() ?? null;
  const stated = note?.match(/\b(EUR|USD|GBP|JPY|CAD|AUD)\b,?\s*([^·;]*)$/);
  const revenueCurrency = stated?.[1] ?? null;

  const rpmbrRaw = find(/^RPMBr/i);
  const window = rpmbrRaw?.match(/(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/);
  const rpmbr: RpmbrLine | null = rpmbrRaw
    ? {
        partner: num(rpmbrRaw.match(/^[€$£¥]?\s*([\d,.]+)\s+per million/i)?.[1]),
        network: num(rpmbrRaw.match(/network, all DSPs:\s*[€$£¥]?\s*([\d,.]+)/i)?.[1]),
        currency: revenueCurrency,
        windowStart: window?.[1] ?? null,
        windowEnd: window?.[2] ?? null,
        basis: rpmbrRaw.match(/\d{4}-\d{2}-\d{2},\s*([^·]+)$/)?.[1].trim() ?? null,
        text: rpmbrRaw,
      }
    : null;

  const checks = (find(/^quality checks/i) ?? '')
    .split(/\s+·\s+/)
    .map(s => s.match(/^(.+?)\s+(PASS|FAIL|NO DATA)$/i))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => ({ name: CHECK_NAMES[m[1].toLowerCase()] ?? m[1], result: m[2].toUpperCase().replace(' ', '_') }));

  // "Cause of the cut: <what the connection log records> · cause from the data: <verdict> (confidence <level>)".
  const cause = find(/^cause of the cut/i);
  const exactReason = cause?.split(/\s+·\s+/)[0].trim() || null;
  const rootCauseConfidence = cause?.match(/\(confidence\s+([a-z]+)\)/i)?.[1].toLowerCase() ?? null;

  for (const a of actions) a.text = a.items.map(i => `${i.signal}.${i.next ? ` ${i.next}` : ''}`).join(' ');
  const publisherDraft = draft.length ? { reviewer: draftTeam?.ownerIsPerson ? draftTeam.owner : null, text: draft.join(' ') } : null;

  return {
    format: 'v4.6-card',
    status,
    network: id?.[1].trim() ?? '',
    networkId: id?.[2] ?? '',
    dsp: id?.[3].trim() ?? '',
    disconnectedOn: when?.[1] ?? '',
    priority,
    summary,
    revenue7d: { amount: num(amount), note },
    rpmbr,
    checks,
    evidenceConfidence: null,
    rootCauseConfidence,
    exactReason,
    leadingHypothesis: hypothesis,
    actions,
    publisherDraft,
    approval: null,
    warnings,
    meta: {
      disconnectedTime: when?.[2] ?? null,
      timezone: tz,
      revenueCurrency,
      revenueCurrencyStated: !!revenueCurrency,
      revenueCurrencyStatus: stated?.[2].trim() || null,
      hypothesisConfirmed: /not confirmed/i.test(hypothesisTags) ? false : null,
      hypothesisLikelihood: hypothesisTags.split(',')[0].trim().toLowerCase() || null,
      approvalCompleted: null,
      externalMessageSent: null,
      draftSent: draftNotSent ? false : null,
      seatCount: null,
    },
    raw,
  };
}
