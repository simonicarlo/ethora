import { TestBed } from '@angular/core/testing';
import { NgZone } from '@angular/core';

import { SseService } from './sse.service';

// Mock EventSource since it is a browser API not available in test environment
class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly listeners = new Map<string, EventListener>();
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
  }

  /** Simulate a server-sent event */
  simulateEvent(type: string, data: string): void {
    const listener = this.listeners.get(type);
    if (listener) {
      const event = new MessageEvent(type, { data });
      listener(event);
    }
  }

  /** Simulate an error */
  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

describe('SseService', () => {
  let service: SseService;
  let originalEventSource: typeof EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    originalEventSource = globalThis.EventSource;
    (globalThis as any).EventSource = MockEventSource;

    TestBed.configureTestingModule({});
    service = TestBed.inject(SseService);
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('connect() should return an Observable', () => {
    const obs = service.connect('/api/v1/sessions/s1/stream');
    expect(obs).toBeDefined();
    expect(typeof obs.subscribe).toBe('function');
  });

  it('should create an EventSource with the given URL on subscribe', () => {
    const url = '/api/v1/sessions/s1/stream';
    const subscription = service.connect(url).subscribe();

    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toBe(url);

    subscription.unsubscribe();
  });

  it('should forward events from EventSource to the Observable', () => {
    const received: MessageEvent[] = [];
    const subscription = service.connect('/test', ['agent_message']).subscribe((event) => {
      received.push(event);
    });

    const mock = MockEventSource.instances[0];
    mock.simulateEvent('agent_message', '{"agent_id":"a1","round":1,"content":"Hello"}');

    expect(received.length).toBe(1);
    expect(received[0].type).toBe('agent_message');
    expect(received[0].data).toBe('{"agent_id":"a1","round":1,"content":"Hello"}');

    subscription.unsubscribe();
  });

  it('should register listeners for all specified event types', () => {
    const events = ['agent_message', 'round_complete', 'verdict'] as const;
    const subscription = service.connect('/test', events).subscribe();

    const mock = MockEventSource.instances[0];
    for (const event of events) {
      expect(mock.listeners.has(event)).toBe(true);
    }

    subscription.unsubscribe();
  });

  it('should emit error when EventSource encounters an error', () => {
    let errorCaught: Error | undefined;

    const subscription = service.connect('/test').subscribe({
      error: (err) => {
        errorCaught = err;
      },
    });

    const mock = MockEventSource.instances[0];
    mock.simulateError();

    expect(errorCaught).toBeDefined();
    expect(errorCaught!.message).toBe('SSE connection lost');

    subscription.unsubscribe();
  });

  it('should close EventSource on unsubscribe', () => {
    const subscription = service.connect('/test').subscribe();

    const mock = MockEventSource.instances[0];
    expect(mock.closed).toBe(false);

    subscription.unsubscribe();
    expect(mock.closed).toBe(true);
  });
});
