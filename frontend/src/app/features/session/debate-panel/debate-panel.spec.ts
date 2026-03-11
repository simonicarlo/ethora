import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { DebatePanel, DebateMessage } from './debate-panel';
import { Agent } from '../../../core/models';

const mockAgents: Agent[] = [
  { id: 'a1', name: 'Analyst', system_prompt: '', model: 'claude-sonnet-4-20250514' },
  { id: 'a2', name: 'Critic', system_prompt: '', model: 'claude-sonnet-4-20250514' },
];

const mockMessages: DebateMessage[] = [
  { agent_id: 'a1', round: 1, content: 'I believe the claim is well-supported.' },
  { agent_id: 'a2', round: 1, content: 'I disagree, the evidence is weak.' },
  { agent_id: 'a1', round: 2, content: 'After considering your point, I revise my position.' },
  { agent_id: 'a2', round: 2, content: 'Thank you for reconsidering.' },
];

@Component({
  selector: 'app-test-host',
  imports: [DebatePanel],
  template: `
    <app-debate-panel
      [messages]="messages()"
      [agents]="agents()"
      [currentRound]="currentRound()"
      [inputClaim]="inputClaim()" />
  `,
})
class TestHost {
  messages = signal<DebateMessage[]>([]);
  agents = signal<Agent[]>(mockAgents);
  currentRound = signal(0);
  inputClaim = signal('');
}

describe('DebatePanel', () => {
  let fixture: ComponentFixture<TestHost>;
  let host: TestHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHost],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
  });

  it('should create the component', () => {
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('app-debate-panel');
    expect(panel).toBeTruthy();
  });

  it('should show empty state when no messages and no claim', () => {
    fixture.detectChanges();
    const empty = fixture.nativeElement.querySelector('.empty-state');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('Waiting for deliberation');
  });

  it('should not show empty state when messages exist', () => {
    host.messages.set(mockMessages);
    fixture.detectChanges();
    const empty = fixture.nativeElement.querySelector('.empty-state');
    expect(empty).toBeFalsy();
  });

  it('should group messages by round', () => {
    host.messages.set(mockMessages);
    fixture.detectChanges();
    const roundGroups = fixture.nativeElement.querySelectorAll('.round-group');
    expect(roundGroups.length).toBe(2);
  });

  it('should display round headings', () => {
    host.messages.set(mockMessages);
    fixture.detectChanges();
    const headings = fixture.nativeElement.querySelectorAll('.round-heading');
    expect(headings[0].textContent).toContain('Round 1');
    expect(headings[1].textContent).toContain('Round 2');
  });

  it('should display message cards with agent names', () => {
    host.messages.set(mockMessages);
    fixture.detectChanges();
    const titles = fixture.nativeElement.querySelectorAll('mat-card-title');
    const names = Array.from(titles).map((t: any) => t.textContent.trim());
    expect(names).toEqual(['Analyst', 'Critic', 'Analyst', 'Critic']);
  });

  it('should display message content', () => {
    host.messages.set(mockMessages);
    fixture.detectChanges();
    const contents = fixture.nativeElement.querySelectorAll('.message-content');
    expect(contents[0].textContent).toContain('well-supported');
    expect(contents[1].textContent).toContain('evidence is weak');
  });

  it('should render 4 message cards for 4 messages', () => {
    host.messages.set(mockMessages);
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.message-card');
    expect(cards.length).toBe(4);
  });

  it('should show "Unknown Agent" for unrecognized agent_id', () => {
    host.messages.set([{ agent_id: 'unknown', round: 1, content: 'Hello' }]);
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('mat-card-title');
    expect(title.textContent).toContain('Unknown Agent');
  });

  it('should render dividers between rounds', () => {
    host.messages.set(mockMessages);
    fixture.detectChanges();
    const dividers = fixture.nativeElement.querySelectorAll('mat-divider');
    expect(dividers.length).toBe(1);
  });

  it('should show claim card when inputClaim is provided', () => {
    host.inputClaim.set('Is climate change accelerating?');
    fixture.detectChanges();
    const claimCard = fixture.nativeElement.querySelector('.claim-card');
    expect(claimCard).toBeTruthy();
    expect(claimCard.textContent).toContain('Deliberation Topic');
    expect(claimCard.textContent).toContain('Is climate change accelerating?');
  });

  it('should not show claim card when inputClaim is empty', () => {
    fixture.detectChanges();
    const claimCard = fixture.nativeElement.querySelector('.claim-card');
    expect(claimCard).toBeFalsy();
  });

  it('should display human messages with person icon', () => {
    host.messages.set([
      { agent_id: 'a1', round: 1, content: 'Agent says hello.' },
      { agent_id: null, agent_name: 'You', round: 1, content: 'Human responds.' },
    ]);
    fixture.detectChanges();

    const icons = fixture.nativeElement.querySelectorAll('mat-card-header mat-icon');
    const iconTexts = Array.from(icons).map((i: any) => i.textContent.trim());
    expect(iconTexts).toEqual(['smart_toy', 'person']);

    const titles = fixture.nativeElement.querySelectorAll('mat-card-title');
    expect(titles[1].textContent.trim()).toBe('You');
  });

  it('should not show empty state when inputClaim is provided but no messages', () => {
    host.inputClaim.set('Test claim');
    fixture.detectChanges();
    const empty = fixture.nativeElement.querySelector('.empty-state');
    expect(empty).toBeFalsy();
  });
});
