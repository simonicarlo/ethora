import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { AdminDashboard } from './admin-dashboard';

describe('AdminDashboard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDashboard, NoopAnimationsModule],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(AdminDashboard);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render a router-outlet', () => {
    const fixture = TestBed.createComponent(AdminDashboard);
    fixture.detectChanges();
    const outlet = fixture.nativeElement.querySelector('router-outlet');
    expect(outlet).toBeTruthy();
  });

  it('should have navigation links to admin sections', () => {
    const fixture = TestBed.createComponent(AdminDashboard);
    fixture.detectChanges();
    const links = fixture.nativeElement.querySelectorAll('[routerLink]');
    expect(links.length).toBeGreaterThan(0);
  });
});
