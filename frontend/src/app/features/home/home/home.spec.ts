import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Home } from './home';

describe('Home', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(Home);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display the hero title', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.hero-title')?.textContent).toContain('Agent Council');
  });

  it('should display the hero subtitle', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.hero-subtitle')?.textContent).toContain('multi-agent deliberation');
  });

  it('should have a Get Started CTA linking to /councils', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    const cta = fixture.nativeElement.querySelector('.hero-cta') as HTMLAnchorElement;
    expect(cta).toBeTruthy();
    expect(cta.textContent).toContain('Get Started');
    expect(cta.getAttribute('href')).toBe('/councils');
  });

  it('should render three feature cards', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.feature-card');
    expect(cards.length).toBe(3);
  });

  it('should display correct feature card titles', () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    const titles = fixture.nativeElement.querySelectorAll('mat-card-title');
    const titleTexts = Array.from(titles).map((t: any) => t.textContent?.trim());
    expect(titleTexts).toEqual(['Assemble a Council', 'Deliberate', 'Vote & Decide']);
  });
});
