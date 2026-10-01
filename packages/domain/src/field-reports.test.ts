import { describe, expect, it } from 'vitest';
import { agentReportState, nextReportStatuses } from './field-reports';

describe('field report instruction', () => {
  it('moves forward only and ends with a decision', () => {
    expect(nextReportStatuses('new')).toEqual(['triaged', 'resolved', 'rejected']);
    expect(nextReportStatuses('triaged')).toEqual(['resolved', 'rejected']);
    expect(nextReportStatuses('resolved')).toEqual([]);
    expect(nextReportStatuses('rejected')).toEqual([]);
  });

  it('tells the agent pending, received or processed', () => {
    expect(agentReportState(null)).toBe('pending');
    expect(agentReportState('new')).toBe('received');
    expect(agentReportState('triaged')).toBe('received');
    expect(agentReportState('resolved')).toBe('processed');
    expect(agentReportState('rejected')).toBe('processed');
  });
});
