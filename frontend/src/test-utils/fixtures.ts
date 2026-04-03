/**
 * Shared test fixtures for reuse across spec files.
 *
 * Mock objects for Agent, Council, Session, and related models used by
 * 6+ spec files — extracted to avoid repetition and drift.
 */
import type {
  Agent,
  AppSetting,
  CouncilUsageItem,
  AgentMetricItem,
  Council,
  ErrorLogEntry,
  SessionListItem,
  SessionStats,
  CouncilStats,
  AgentStats,
} from '../app/core/models';

export const mockAgent1: Agent = {
  id: 'a1',
  name: 'Analyst',
  system_prompt: 'You are an analytical expert.',
  model: 'claude-sonnet-4-20250514',
  icon: 'smart_toy',
};

export const mockAgent2: Agent = {
  id: 'a2',
  name: 'Critic',
  system_prompt: 'You are a critical thinker.',
  model: 'claude-sonnet-4-20250514',
  icon: 'psychology',
};

export const mockAgent3: Agent = {
  id: 'a3',
  name: 'Synthesizer',
  system_prompt: 'You synthesize viewpoints.',
  model: 'claude-sonnet-4-20250514',
  icon: 'hub',
};

export const mockAgents: Agent[] = [mockAgent1, mockAgent2, mockAgent3];

export const mockCouncil1: Council = {
  id: 'c1',
  name: 'Fact Checkers',
  rounds: 3,
  voting_mechanism: 'majority',
  allow_human_turns: false,
  tools_enabled: false,
  agents: [mockAgent1, mockAgent2],
};

export const mockCouncil2: Council = {
  id: 'c2',
  name: 'Ethics Board',
  rounds: 5,
  voting_mechanism: 'consensus',
  allow_human_turns: true,
  tools_enabled: true,
  agents: [mockAgent1, mockAgent2, mockAgent3],
};

export const mockCouncils: Council[] = [mockCouncil1, mockCouncil2];

export const mockSessionListItem1: SessionListItem = {
  id: 's1',
  council_id: 'c1',
  council_name: 'Fact Checkers',
  input_claim: 'The earth is flat.',
  question_type: 'binary',
  status: 'complete',
  verdict_summary: 'False — no scientific support.',
  created_at: '2026-01-01T12:00:00Z',
};

export const mockSessionListItem2: SessionListItem = {
  id: 's2',
  council_id: 'c2',
  council_name: 'Ethics Board',
  input_claim: 'AI should be regulated.',
  question_type: 'open',
  status: 'running',
  verdict_summary: null,
  created_at: '2026-01-02T09:00:00Z',
};

export const mockSessions: SessionListItem[] = [mockSessionListItem1, mockSessionListItem2];

export const mockAppSetting = (key: string, value: string): AppSetting => ({
  key,
  value,
  updated_at: '2026-01-01T00:00:00Z',
});

export const mockErrorLogEntry: ErrorLogEntry = {
  session_id: 's1',
  council_name: 'Fact Checkers',
  input_claim: 'The earth is flat.',
  error_message: 'LLM connection failed',
  created_at: '2026-01-01T12:00:00Z',
};

export const mockCouncilUsage: CouncilUsageItem[] = [
  {
    council_id: 'c1',
    council_name: 'Fact Checkers',
    session_count: 12,
    avg_deliberation_seconds: 145.3,
  },
];

export const mockAgentMetrics: AgentMetricItem[] = [
  {
    agent_id: 'a1',
    agent_name: 'Analyst',
    message_count: 48,
    avg_message_length: 320,
    voting_alignment: 0.75,
  },
];

export const mockSessionStats: SessionStats = {
  total_sessions: 42,
  sessions_by_status: { complete: 30, running: 5, pending: 7 },
  completion_rate: 0.71,
  avg_rounds_per_session: 3.2,
  sessions_over_time: [
    { date: '2026-01-01', count: 5 },
    { date: '2026-01-02', count: 8 },
  ],
};

export const mockCouncilStats: CouncilStats = {
  council_usage: mockCouncilUsage,
};

export const mockAgentStats: AgentStats = {
  agent_metrics: mockAgentMetrics,
};
