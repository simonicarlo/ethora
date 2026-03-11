import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-agent-chip',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .agent-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      vertical-align: middle;
      color: var(--mat-sys-primary);
    }
  `,
  template: `<mat-icon class="agent-icon">{{ icon() || 'smart_toy' }}</mat-icon><span class="agent-name-text">{{ name() }}</span>`,
})
export class AgentChip {
  readonly name = input.required<string>();
  readonly icon = input<string | null | undefined>();
}
