import { TestBed, ComponentFixture } from '@angular/core/testing';

import { VotingPanel } from './voting-panel';
import type { Agent, Vote, VotingMechanism } from '../../../core/models';

describe('VotingPanel', () => {
  let fixture: ComponentFixture<VotingPanel>;
  let component: VotingPanel;

  const mockAgents: Agent[] = [
    { id: 'a1', name: 'Source Critic', system_prompt: 'Prompt 1', model: 'claude-sonnet-4-20250514', icon: 'smart_toy' },
    { id: 'a2', name: 'Logical Analyst', system_prompt: 'Prompt 2', model: 'claude-sonnet-4-20250514', icon: 'smart_toy' },
  ];

  const mockVotes: Vote[] = [
    { id: 'v1', agent_id: 'a1', value: 'true', confidence: 0.85, reasoning: 'Solid evidence.' },
    { id: 'v2', agent_id: 'a2', value: 'false', confidence: 0.6, reasoning: 'Unconvincing.' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VotingPanel],
    }).compileComponents();

    fixture = TestBed.createComponent(VotingPanel);
    component = fixture.componentInstance;

    // Set required inputs before first change detection
    fixture.componentRef.setInput('votes', mockVotes);
    fixture.componentRef.setInput('agents', mockAgents);
    fixture.componentRef.setInput('votingMechanism', 'majority' as VotingMechanism);
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  describe('confidencePercent', () => {
    it('should return rounded percentage for a valid confidence', () => {
      expect(component.confidencePercent(0.85)).toBe(85);
    });

    it('should round to nearest integer', () => {
      expect(component.confidencePercent(0.333)).toBe(33);
      expect(component.confidencePercent(0.667)).toBe(67);
    });

    it('should return 0 for null confidence', () => {
      expect(component.confidencePercent(null)).toBe(0);
    });

    it('should return 0 for zero confidence', () => {
      expect(component.confidencePercent(0)).toBe(0);
    });

    it('should return 100 for full confidence', () => {
      expect(component.confidencePercent(1)).toBe(100);
    });
  });

  describe('voteColor', () => {
    it('should return "affirm" for truthy values', () => {
      expect(component.voteColor('true')).toBe('affirm');
      expect(component.voteColor('yes')).toBe('affirm');
      expect(component.voteColor('agree')).toBe('affirm');
    });

    it('should return "affirm" regardless of case', () => {
      expect(component.voteColor('True')).toBe('affirm');
      expect(component.voteColor('YES')).toBe('affirm');
      expect(component.voteColor('Agree')).toBe('affirm');
    });

    it('should return "oppose" for falsy values', () => {
      expect(component.voteColor('false')).toBe('oppose');
      expect(component.voteColor('no')).toBe('oppose');
      expect(component.voteColor('disagree')).toBe('oppose');
    });

    it('should return "oppose" regardless of case', () => {
      expect(component.voteColor('False')).toBe('oppose');
      expect(component.voteColor('NO')).toBe('oppose');
      expect(component.voteColor('Disagree')).toBe('oppose');
    });

    it('should return "neutral" for unrecognized values', () => {
      expect(component.voteColor('maybe')).toBe('neutral');
      expect(component.voteColor('abstain')).toBe('neutral');
      expect(component.voteColor('')).toBe('neutral');
    });
  });

  describe('voteMap', () => {
    it('should build a map keyed by agent_id', () => {
      const map = component.voteMap();
      expect(map.size).toBe(2);
      expect(map.get('a1')).toEqual(mockVotes[0]);
      expect(map.get('a2')).toEqual(mockVotes[1]);
    });

    it('should update when votes input changes', () => {
      const newVotes: Vote[] = [
        { id: 'v3', agent_id: 'a1', value: 'agree', confidence: 0.95, reasoning: null },
      ];
      fixture.componentRef.setInput('votes', newVotes);
      fixture.detectChanges();

      const map = component.voteMap();
      expect(map.size).toBe(1);
      expect(map.get('a1')!.value).toBe('agree');
    });
  });
});
