export interface Agent {
  id: string;
  name: string;
  system_prompt: string;
  model: string;
}

export interface AgentCreate {
  name: string;
  system_prompt: string;
  model?: string;
}

export interface Council {
  id: string;
  name: string;
  rounds: number;
  voting_mechanism: VotingMechanism;
  allow_human_turns: boolean;
  agents: Agent[];
}

export interface CouncilCreate {
  name: string;
  rounds?: number;
  voting_mechanism?: VotingMechanism;
  allow_human_turns?: boolean;
  agent_ids: string[];
}

export type VotingMechanism = 'majority' | 'weighted' | 'consensus' | 'human_in_loop';
export type SessionStatus = 'pending' | 'running' | 'voting' | 'awaiting_human_turn' | 'complete' | 'error';

export interface Session {
  id: string;
  council_id: string;
  input_claim: string;
  status: SessionStatus;
  created_at: string;
}

export interface SessionCreate {
  council_id: string;
  input_claim: string;
}

export interface Message {
  id: string;
  round_id: string;
  agent_id: string;
  content: string;
  created_at: string;
}

export interface Vote {
  id: string;
  agent_id: string;
  value: string;
  confidence: number | null;
  reasoning: string | null;
}

export interface Verdict {
  id: string;
  session_id: string;
  decision: string;
  confidence: number | null;
  summary: string | null;
  created_at: string;
}
