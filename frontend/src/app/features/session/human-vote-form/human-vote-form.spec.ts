import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { HumanVoteForm } from './human-vote-form';
import { ApiService } from '../../../core/api.service';
import type { Verdict } from '../../../core/models';

describe('HumanVoteForm', () => {
  let fixture: ComponentFixture<HumanVoteForm>;
  let component: HumanVoteForm;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HumanVoteForm],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(HumanVoteForm);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);

    fixture.componentRef.setInput('sessionId', 's1');
    fixture.detectChanges();
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  describe('initial state', () => {
    it('should have empty decision', () => {
      expect(component.decision()).toBe('');
    });

    it('should have confidence of 0.5', () => {
      expect(component.confidence()).toBe(0.5);
    });

    it('should have empty reasoning', () => {
      expect(component.reasoning()).toBe('');
    });

    it('should not be submitting', () => {
      expect(component.submitting()).toBe(false);
    });

    it('should have no error', () => {
      expect(component.error()).toBe('');
    });
  });

  describe('onSubmit', () => {
    it('should do nothing when decision is empty', () => {
      component.onSubmit();

      httpTesting.expectNone('/api/v1/sessions/s1/human-vote');
      expect(component.submitting()).toBe(false);
    });

    it('should set submitting to true and call API on valid submit', () => {
      component.decision.set('agree');
      component.confidence.set(0.8);
      component.reasoning.set('I agree with the analysis.');

      component.onSubmit();

      expect(component.submitting()).toBe(true);
      expect(component.error()).toBe('');

      const req = httpTesting.expectOne('/api/v1/sessions/s1/human-vote');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        decision: 'agree',
        confidence: 0.8,
        reasoning: 'I agree with the analysis.',
      });

      // Flush a successful response
      const mockVerdict: Verdict = {
        id: 'v1',
        session_id: 's1',
        decision: 'agree',
        confidence: 0.8,
        summary: 'Human decision.',
        created_at: '2026-03-10T00:00:00Z',
      };
      req.flush(mockVerdict);

      expect(component.submitting()).toBe(false);
    });

    it('should emit voted event on successful submit', () => {
      const emitted: Verdict[] = [];
      component.voted.subscribe((v) => emitted.push(v));

      component.decision.set('yes');
      component.onSubmit();

      const mockVerdict: Verdict = {
        id: 'v1',
        session_id: 's1',
        decision: 'yes',
        confidence: 0.5,
        summary: null,
        created_at: '2026-03-10T00:00:00Z',
      };

      const req = httpTesting.expectOne('/api/v1/sessions/s1/human-vote');
      req.flush(mockVerdict);

      expect(emitted.length).toBe(1);
      expect(emitted[0]).toEqual(mockVerdict);
    });

    it('should send undefined reasoning when reasoning is empty', () => {
      component.decision.set('no');
      component.reasoning.set('');

      component.onSubmit();

      const req = httpTesting.expectOne('/api/v1/sessions/s1/human-vote');
      expect(req.request.body.reasoning).toBeUndefined();
      req.flush({});
    });

    it('should set error on API failure', () => {
      component.decision.set('agree');
      component.onSubmit();

      const req = httpTesting.expectOne('/api/v1/sessions/s1/human-vote');
      req.flush({ detail: 'Session not in voting state' }, { status: 400, statusText: 'Bad Request' });

      expect(component.submitting()).toBe(false);
      expect(component.error()).toBe('Session not in voting state');
    });

    it('should show generic error when API error has no detail', () => {
      component.decision.set('agree');
      component.onSubmit();

      const req = httpTesting.expectOne('/api/v1/sessions/s1/human-vote');
      req.flush(null, { status: 500, statusText: 'Internal Server Error' });

      expect(component.submitting()).toBe(false);
      expect(component.error()).toBe('Failed to submit vote');
    });
  });
});
