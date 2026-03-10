import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';

const SSE_EVENTS = ['agent_message', 'round_complete', 'voting_cast', 'verdict', 'status'] as const;

export type SseEventType = (typeof SSE_EVENTS)[number];

@Injectable({
  providedIn: 'root',
})
export class SseService {
  constructor(private readonly zone: NgZone) {}

  connect(url: string, events: readonly string[] = SSE_EVENTS): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const eventSource = new EventSource(url);

      for (const event of events) {
        eventSource.addEventListener(event, (e) => {
          this.zone.run(() => subscriber.next(e as MessageEvent));
        });
      }

      eventSource.onerror = () => {
        this.zone.run(() => subscriber.error(new Error('SSE connection lost')));
      };

      return () => eventSource.close();
    });
  }
}
