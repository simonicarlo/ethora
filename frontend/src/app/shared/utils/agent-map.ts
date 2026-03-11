import { Agent } from '../../core/models';

/** Build a lookup map from agent ID to Agent object. */
export function buildAgentMap(agents: Agent[]): Map<string, Agent> {
  const map = new Map<string, Agent>();
  for (const agent of agents) {
    map.set(agent.id, agent);
  }
  return map;
}
