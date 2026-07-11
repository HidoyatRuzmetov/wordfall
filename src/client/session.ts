/** In-memory state shared across scenes for the current session. */
import type { DailyConfig, DailyResponse, RunResult, SubmitResponse } from '../shared/types';

export type SubmitSyncState = 'idle' | 'pending' | 'synced' | 'failed';

type SessionState = {
  daily: DailyResponse | null;
  config: DailyConfig | null;
  lastRun: RunResult | null;
  lastSubmit: SubmitResponse | null;
  pendingSubmit: Promise<SubmitResponse> | null;
  submitSync: SubmitSyncState;
  seenHowTo: boolean;
};

export const Session: SessionState = {
  daily: null,
  config: null,
  lastRun: null,
  lastSubmit: null,
  pendingSubmit: null,
  submitSync: 'idle',
  seenHowTo: false,
};
