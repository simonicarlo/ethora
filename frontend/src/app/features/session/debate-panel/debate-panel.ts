import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

import { Agent, MessageType, Reference } from '../../../core/models';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';

export interface ToolActivity {
  agent_id: string;
  agent_name: string;
  tool_name: string;
}

export interface DebateMessage {
  agent_id: string | null;
  agent_name?: string;
  message_type?: MessageType;
  message_id?: string;
  round: number;
  content: string;
  summary?: string | null;
  references?: Reference[];
}

@Component({
  selector: 'app-debate-panel',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatDividerModule, MarkdownPipe],
  templateUrl: './debate-panel.html',
  styleUrl: './debate-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DebatePanel {
  readonly messages = input.required<DebateMessage[]>();
  readonly agents = input.required<Agent[]>();
  readonly currentRound = input<number>(0);
  readonly inputClaim = input<string>('');
  readonly activeToolUse = input<ToolActivity | null>(null);
  readonly typingAgent = input<{ agent_id: string; agent_name: string } | null>(null);

  readonly expandedMessages = signal<Set<string>>(new Set());

  toggleExpanded(roundNum: number, index: number): void {
    const key = `${roundNum}-${index}`;
    this.expandedMessages.update((set) => {
      const next = new Set(set);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  isExpanded(roundNum: number, index: number): boolean {
    return this.expandedMessages().has(`${roundNum}-${index}`);
  }

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
