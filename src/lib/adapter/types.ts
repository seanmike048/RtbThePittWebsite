/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * RTB Command Center · Equativ TechOps
 * Source file: src/lib/adapter/types.ts
 * Typed contracts for workflow input, finalized reports, and internal view model.
 */

export type PriorityCode = 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P?' | 'UNAVAILABLE';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN' | 'UNAVAILABLE';

export const PRIORITY_LABELS: Record<PriorityCode, string> = {
  P0: 'P0 · URGENT',
  P1: 'P1 · HIGH',
  P2: 'P2 · MEDIUM',
  P3: 'P3 · LOW',
  P4: 'P4 · NONE',
  'P?': 'P? · UNKNOWN',
  UNAVAILABLE: 'Awaiting finalized report',
};

export const PRIORITY_COLORS: Record<PriorityCode, { bg: string; text: string; border: string }> = {
  P0: { bg: 'bg-danger-soft', text: 'text-danger-ink', border: 'border-danger/30' },
  P1: { bg: 'bg-warn-soft', text: 'text-warn-ink', border: 'border-warn/30' },
  P2: { bg: 'bg-info-soft', text: 'text-info', border: 'border-info/30' },
  P3: { bg: 'bg-surface-2', text: 'text-ink-2', border: 'border-line-strong' },
  P4: { bg: 'bg-ok-soft', text: 'text-ok-ink', border: 'border-ok/30' },
  'P?': { bg: 'bg-accent-soft', text: 'text-accent-ink', border: 'border-accent/30' },
  UNAVAILABLE: { bg: 'bg-surface-2', text: 'text-muted', border: 'border-line-strong border-dashed' },
};

export interface DisconnectionPartnerRecord {
  partnerId: number;
  partnerName: string;
  disconnectionTimestamp: string; // Preserves source string, e.g. "2026-10-05T09:14:00"
  reconnectionTimestamp: string | null;
  status: 'still_disconnected' | 'reconnected';
  spend7dBefore: number;
  currency: string | null; // null if not provided
  reason: string | null;
  reasonType: 'hypothesis' | 'confirmed' | 'unavailable';
  ownerContext: string;
  dataQualityNotes: string[];
}

export interface RTBViewModel {
  sourceType: 'sample_input' | 'finalized_report' | 'custom_input';
  sourceTitle: string;
  isProductionData: boolean; // false for sample input

  // Operational Metadata
  metadata: {
    moduleReportingWindow: string; // "2026-10-01 to 2026-10-08"
    timezone: string; // "Europe/Paris"
    importTimestamp: string; // Client import timestamp
    metricPeriod: string; // "2026-09-28..10-04 vs 2026-10-06..10-12"
    hasWindowCoverageDiscrepancy: boolean;
    windowDiscrepancyNotice: string;
  };

  // Main KPI Overview
  overview: {
    priority: PriorityCode;
    confidence: ConfidenceLevel;
    prioritySource: 'explicit_backend' | 'unavailable_in_sample';
    confidenceSource: 'explicit_backend' | 'unavailable_in_sample';
    publisherName: string;
    publisherId: number | string;
    publishersCount: number;
    distinctPartnerIds: number[];
    partnerSeatsNote: string;
    bidRequestsBefore: number;
    bidRequestsAfter: number;
    reportedChangePct: number;
    revenuePrior7dDays: {
      partnerId: number;
      partnerName: string;
      amount: number;
      currency: string | null;
    }[];
    totalRevenuePrior7d: number | null; // null if currency is not provided!
    revenueNote: string;
    validationIssuesCount: number;
  };

  // Evidence & Investigation Panel
  investigation: {
    finding: string | null; // null if raw input
    findingStatus: 'finalized_validated' | 'unavailable';
    confirmedFacts: string[];
    selectedEvidence: {
      title: string;
      detail: string;
      source: string;
    }[];
    unknowns: string[];
    hypotheses: {
      statement: string;
      status: 'unconfirmed_hypothesis';
      note: string;
    }[];
    confirmedReason: string | null;
    primaryAction: string | null;
    ownerActions: string[];
    contacts: {
      role: string;
      nameOrTeam: string;
      source: string;
    }[];
    availableReferences: string[];
  };

  // Disconnections Table
  disconnections: DisconnectionPartnerRecord[];

  // Validation & Communication (Boundary C)
  validation: {
    isFinalizedReportSupplied: boolean;
    issues: string[];
    fallbackFields: string[];
    clientMessage: string | null;
    slackText: string | null;
    slackWordCount: number;
    isSlackExceeding200Words: boolean;
  };

  // Amazon DSP Analytics & Signals
  amazonDspAnalytics: {
    hasDetailedTelemetry: boolean;
    telemetryUnavailableReason: string;
    signalChecklist: {
      signal: string;
      category: 'Policy Requirement' | 'Internal Benchmark' | 'Unconfirmed Team Signal';
      status: 'SUPPORTED' | 'NOT_AVAILABLE_IN_QUERY' | 'OBSERVED_ACCEPTABLE';
      notes: string;
    }[];
  };

  rawSourceJson: string;
}

export interface ParseResult {
  success: boolean;
  model?: RTBViewModel;
  error?: string;
  fieldErrors?: { field: string; message: string }[];
  isN8nWorkflowDefinition?: boolean;
}
