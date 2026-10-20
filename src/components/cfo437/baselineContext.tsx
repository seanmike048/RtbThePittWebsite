import { createContext, useContext } from 'react';
import { type BaselineView, VISIBLE_VIEW } from '../../lib/cfo437/baseline.ts';
import { daysInMonth, monthLabel } from '../../lib/cfo437/live.ts';
import { aggregate, isVisible, type PublisherRow } from '../../lib/cfo437/publishers.ts';

/** The baseline every section reads: the validated workbook figures, or a live Snowflake month. */
export interface ActiveBaseline {
  view: BaselineView;
  month: string;
  period: string;
  days: number;
  source: 'validated' | 'live';
  label: string;
}

export const VALIDATED_BASELINE: ActiveBaseline = {
  view: VISIBLE_VIEW,
  month: '2026-09',
  period: 'September 2026',
  days: 30,
  source: 'validated',
  label: 'Validated workbook baseline',
};

export function liveBaseline(rows: PublisherRow[], month: string): ActiveBaseline {
  const a = aggregate(rows.filter(isVisible));
  return {
    view: {
      label: `Live Snowflake · ${monthLabel(month)}`,
      rows: a.rows,
      positiveRows: a.positiveRows,
      zeroRows: a.zeroRows,
      bidRequests: a.bidRequests,
      spend: a.spend,
      weightedRpmbr: a.weightedRpmbr,
      medianPositiveRpmbr: a.medianPositiveRpmbr,
      top16SharePct: a.top16SharePct,
    },
    month,
    period: monthLabel(month),
    days: daysInMonth(month),
    source: 'live',
    label: `Live Snowflake baseline · ${monthLabel(month)}`,
  };
}

export const BaselineContext = createContext<ActiveBaseline>(VALIDATED_BASELINE);
export const useBaseline = () => useContext(BaselineContext);
