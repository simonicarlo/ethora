import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

import { Agent, MessageType } from '../../../core/models';

export interface DebateMessage {
  agent_id: string | null;
  agent_name?: string;
  message_type?: MessageType;
  round: number;
  content: string;
}

@Component({
  selector: 'app-debate-panel',
  imports: [MatCardModule, MatIconModule, MatDividerModule],
  templateUrl: './debate-panel.html',
  styleUrl: './debate-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DebatePanel {
  readonly messages = input.required<DebateMessage[]>();
  readonly agents = input.required<Agent[]>();
  readonly currentRound = input<number>(0);
  readonly inputClaim = input<string>('');

  readonly agentMap = computed(() => {
    const map = new Map<string, Agent>();
    for (const agent of this.agents()) {
      map.set(agent.id, agent);
    }
    return map;
  });

  readonly rounds = computed(() => {
    const msgs = this.messages();
    if (msgs.length === 0) return [];

    const maxRound = Math.max(...msgs.map((m) => m.round));
    const rounds: { round: number; messages: (DebateMessage & { agentName: string; isHuman: boolean; isModerator: boolean; icon: string })[] }[] = [];

    for (let r = 1; r <= maxRound; r++) {
      rounds.push({
        round: r,
        messages: msgs
          .filter((m) => m.round === r)
          .map((m) => {
            const isModerator = m.message_type === 'moderator';
            const isHuman = m.message_type === 'human' || (!m.message_type && m.agent_id === null);
            const icon = isModerator ? 'shield' : isHuman ? 'person' : 'smart_toy';
            const agentName = isModerator
              ? 'Moderator'
              : isHuman
                ? (m.agent_name ?? 'Human')
                : (m.agent_id ? (this.agentMap().get(m.agent_id)?.name ?? m.agent_name ?? 'Unknown Agent') : (m.agent_name ?? 'Unknown Agent'));
            return { ...m, isHuman, isModerator, icon, agentName };
          }),
      });
    }
    return rounds;
  });
}
