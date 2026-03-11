import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';

const SSE_EVENTS = ['agent_message', 'round_complete', 'candidate_proposed', 'candidates_finalized', 'moderator_action', 'voting_cast', 'verdict', 'awaiting_human_turn', 'awaiting_human_vote', 'error'] as const;

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
          // NgZone.run(): EventSource callbacks fire outside Angular's zone,
          // so change detection won't trigger unless we re-enter the zone.
          this.zone.run(() => subscriber.next(e as MessageEvent));
        });
      }

      eventSource.onerror = () => {
        this.zone.run(() => {
          if (eventSource.readyState === EventSource.CLOSED) {
            subscriber.complete(); // Normal server-side close
          } else {
            subscriber.error(new Error('SSE connection lost'));
          }
        });
      };

      // Teardown: close the EventSource to prevent memory leaks and dangling HTTP connections.
      return () => eventSource.close();
    });
  }
}
