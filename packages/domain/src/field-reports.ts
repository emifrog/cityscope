/**
 * Field reports (OPS-04, ADR-017): a discrepancy observed by an agent on the
 * published version installed on their terminal. A report is a proposal for
 * the Prévision service: it never changes a publication by itself.
 */

/** Categories of the maquette (screen 09) and of the data model. */
export const REPORT_CATEGORIES = ['access', 'water', 'risk', 'contact', 'plan', 'other'] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_SEVERITIES = ['info', 'important', 'urgent'] as const;
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number];

/** States of the data model; resolved and rejected are final, with a documented decision. */
export const REPORT_STATUSES = ['new', 'triaged', 'resolved', 'rejected'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Element of the published version the report is about. */
export const REPORT_ITEM_TYPES = ['object', 'risk', 'zone'] as const;
export type ReportItemType = (typeof REPORT_ITEM_TYPES)[number];

export const MAX_REPORT_PHOTOS = 5;
export const MAX_REPORT_DESCRIPTION = 2000;
export const MAX_REPORT_DECISION = 2000;

export const FINAL_REPORT_STATUSES: ReadonlySet<ReportStatus> = new Set(['resolved', 'rejected']);

/** Next states the Prévision may give a report (the database enforces the same rules). */
export function nextReportStatuses(status: ReportStatus): readonly ReportStatus[] {
  switch (status) {
    case 'new':
      return ['triaged', 'resolved', 'rejected'];
    case 'triaged':
      return ['resolved', 'rejected'];
    default:
      return [];
  }
}

/**
 * What the agent sees (architecture §11): "pending" until the server
 * acknowledged the report, "received" while it is instructed, "processed"
 * once decided — a documented decision, not necessarily a published fix.
 */
export const AGENT_REPORT_STATES = ['pending', 'received', 'processed'] as const;
export type AgentReportState = (typeof AGENT_REPORT_STATES)[number];

export function agentReportState(status: ReportStatus | null): AgentReportState {
  if (status === null) return 'pending';
  return FINAL_REPORT_STATUSES.has(status) ? 'processed' : 'received';
}
