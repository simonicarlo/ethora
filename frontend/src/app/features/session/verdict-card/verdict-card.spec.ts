import { TestBed, ComponentFixture } from '@angular/core/testing';

import { VerdictCard } from './verdict-card';
import type { Verdict } from '../../../core/models';

describe('VerdictCard', () => {
  let fixture: ComponentFixture<VerdictCard>;
  let component: VerdictCard;

  const mockVerdict: Verdict = {
    id: 'v1',
    session_id: 's1',
    decision: 'true',
    confidence: 0.87,
    summary: 'The council has reached a consensus.',
    created_at: '2026-03-10T12:00:00Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerdictCard],
    }).compileComponents();

    fixture = TestBed.createComponent(VerdictCard);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('verdict', mockVerdict);
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  describe('confidencePercent', () => {
    it('should return rounded percentage', () => {
      expect(component.confidencePercent()).toBe(87);
    });

    it('should return 0 when confidence is null', () => {
      fixture.componentRef.setInput('verdict', { ...mockVerdict, confidence: null });
      fixture.detectChanges();
      expect(component.confidencePercent()).toBe(0);
    });

    it('should handle edge values', () => {
      fixture.componentRef.setInput('verdict', { ...mockVerdict, confidence: 0 });
      fixture.detectChanges();
      expect(component.confidencePercent()).toBe(0);

      fixture.componentRef.setInput('verdict', { ...mockVerdict, confidence: 1 });
      fixture.detectChanges();
      expect(component.confidencePercent()).toBe(100);
    });
  });

  describe('decisionClass', () => {
    it('should return "affirm" for affirmative decisions', () => {
      for (const decision of ['true', 'True', 'yes', 'YES', 'agree', 'Agree']) {
        fixture.componentRef.setInput('verdict', { ...mockVerdict, decision });
        fixture.detectChanges();
        expect(component.decisionClass()).toBe('affirm');
      }
    });

    it('should return "oppose" for negative decisions', () => {
      for (const decision of ['false', 'False', 'no', 'NO', 'disagree', 'Disagree']) {
        fixture.componentRef.setInput('verdict', { ...mockVerdict, decision });
        fixture.detectChanges();
        expect(component.decisionClass()).toBe('oppose');
      }
    });

    it('should return "neutral" for unrecognized decisions', () => {
      fixture.componentRef.setInput('verdict', { ...mockVerdict, decision: 'undecided' });
      fixture.detectChanges();
      expect(component.decisionClass()).toBe('neutral');
    });
  });

  describe('decisionIcon', () => {
    it('should return "check_circle" for affirm class', () => {
      fixture.componentRef.setInput('verdict', { ...mockVerdict, decision: 'yes' });
      fixture.detectChanges();
      expect(component.decisionIcon()).toBe('check_circle');
    });

    it('should return "cancel" for oppose class', () => {
      fixture.componentRef.setInput('verdict', { ...mockVerdict, decision: 'no' });
      fixture.detectChanges();
      expect(component.decisionIcon()).toBe('cancel');
    });

    it('should return "help" for neutral class', () => {
      fixture.componentRef.setInput('verdict', { ...mockVerdict, decision: 'maybe' });
      fixture.detectChanges();
      expect(component.decisionIcon()).toBe('help');
    });
  });
});
