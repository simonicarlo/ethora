import { Injectable, NgZone } from '@angular/core';
import { Observable, retry, timer } from 'rxjs';

const SSE_EVENTS = ['stage_set', 'stage_set_intro', 'agent_message', 'agent_typing', 'summary_ready', 'round_complete', 'tool_use', 'candidate_proposed', 'candidates_finalized', 'moderator_action', 'voting_started', 'voting_cast', 'closing_statement', 'verdict', 'awaiting_human_turn', 'awaiting_human_vote', 'error', 'rate_limited'] as const;

export type SseEventType = (typeof SSE_EVENTS)[number];

export interface SseRetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: SseRetryConfig = {
  maxRetries: 5,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

@Injectable({
  providedIn: 'root',
})
export class SseService {
  constructor(private readonly zone: NgZone) {}

  connect(
    url: string,
    events: readonly string[] = SSE_EVENTS,
    retryConfig: Partial<SseRetryConfig> = {},
  ): Observable<MessageEvent> {
    const config: SseRetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

    return this.createEventSource(url, events).pipe(
      retry({
        count: config.maxRetries,
        delay: (_error, retryIndex) => {
          const delay = Math.min(
            config.initialDelay * Math.pow(config.backoffMultiplier, retryIndex - 1),
            config.maxDelay,
          );
          return timer(delay);
        },
      }),
    );
  }

  private createEventSource(url: string, events: readonly string[]): Observable<MessageEvent> {
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
