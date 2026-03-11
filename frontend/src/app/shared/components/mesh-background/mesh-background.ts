import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-mesh-background',
  templateUrl: './mesh-background.html',
  styleUrl: './mesh-background.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-scheme]': 'scheme()' },
})
export class MeshBackground {
  readonly scheme = input.required<'councils' | 'sessions' | 'dialogue' | 'home'>();
}
