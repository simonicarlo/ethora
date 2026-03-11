import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

import { Agent } from '../../../core/models';

export interface DebateMessage {
  agent_id: string;
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
    const rounds: { round: number; messages: (DebateMessage & { agentName: string })[] }[] = [];

    for (let r = 1; r <= maxRound; r++) {
      rounds.push({
        round: r,
        messages: msgs
          .filter((m) => m.round === r)
          .map((m) => ({
            ...m,
            agentName: this.agentMap().get(m.agent_id)?.name ?? 'Unknown Agent',
          })),
      });
    }
    return rounds;
  });
}
