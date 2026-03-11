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

export type AgentUpdate = Partial<AgentCreate>;

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

export type CouncilUpdate = Partial<CouncilCreate>;

export type VotingMechanism = 'majority' | 'weighted' | 'consensus' | 'human_in_loop';
export type QuestionType = 'binary' | 'open';
export type SessionStatus = 'pending' | 'running' | 'proposing' | 'voting' | 'awaiting_human_turn' | 'complete' | 'error';

export interface Session {
  id: string;
  council_id: string;
  input_claim: string;
  question_type: QuestionType;
  status: SessionStatus;
  created_at: string;
}

export interface SessionListItem {
  id: string;
  council_id: string;
  council_name: string;
  input_claim: string;
  question_type: QuestionType;
  status: SessionStatus;
  verdict_summary: string | null;
  created_at: string;
}

export interface SessionCreate {
  council_id: string;
  input_claim: string;
  question_type?: QuestionType;
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

// -- Session state (cold-load) ---------------------------------------------

export interface MessageWithContext {
  id: string;
  round_number: number;
  agent_id: string | null;
  agent_name: string | null;
  content: string;
  created_at: string;
}

export interface SessionState {
  messages: MessageWithContext[];
  votes: Vote[];
}

// -- SSE event payloads ---------------------------------------------------

export interface SseAgentMessage {
  agent_id: string;
  agent_name: string;
  round: number;
  content: string;
}

export interface SseRoundComplete {
  round: number;
}

export interface SseVotingCast {
  agent_id: string;
  agent_name: string;
  vote?: string;
  value?: string;
  confidence: number;
  reasoning: string | null;
}

export interface SseVerdict {
  decision: string;
  confidence: number | null;
  summary: string | null;
}

export interface SseAwaitingHumanTurn {
  round: number;
  message: string;
}

export interface SseAwaitingHumanVote {
  message: string;
}

export interface SseError {
  message: string;
}

export interface SseCandidateProposed {
  agent_id: string;
  agent_name: string;
  candidates: string[];
}

export interface SseCandidatesFinalized {
  candidates: string[];
}

export interface SseModeratorAction {
  action: string;
  explanation: string;
}
