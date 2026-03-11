import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { ToolDefinition, TOOL_DEFINITIONS } from './tool-registry.data';

@Component({
  selector: 'app-tool-registry',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSlideToggleModule,
  ],
  templateUrl: './tool-registry.html',
  styleUrl: './tool-registry.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolRegistry {
  readonly tools = TOOL_DEFINITIONS;
  readonly selectedTool = signal<ToolDefinition | null>(null);
  readonly enabledTools = signal<Set<string>>(new Set());
  readonly paramValues = signal<Record<string, Record<string, number | string | boolean>>>({});

  constructor() {
    const defaults: Record<string, Record<string, number | string | boolean>> = {};
    for (const tool of this.tools) {
      defaults[tool.id] = {};
      for (const param of tool.parameters) {
        defaults[tool.id][param.name] = param.default;
      }
    }
    this.paramValues.set(defaults);
  }

  protected getInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  selectTool(tool: ToolDefinition): void {
    this.selectedTool.set(tool);
  }

  isEnabled(toolId: string): boolean {
    return this.enabledTools().has(toolId);
  }

  toggleTool(toolId: string): void {
    this.enabledTools.update(set => {
      const next = new Set(set);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  }

  getParamValue(toolId: string, paramName: string): number | string | boolean {
    return this.paramValues()[toolId]?.[paramName] ?? '';
  }

  setParamValue(toolId: string, paramName: string, value: number | string | boolean): void {
    this.paramValues.update(all => ({
      ...all,
      [toolId]: { ...all[toolId], [paramName]: value },
    }));
  }
}
