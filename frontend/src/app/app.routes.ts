import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home/home').then(m => m.Home) },
  { path: 'councils', loadComponent: () => import('./features/council/council-list/council-list').then(m => m.CouncilList) },
  { path: 'councils/new', loadComponent: () => import('./features/council/council-form/council-form').then(m => m.CouncilForm) },
  { path: 'councils/:id/edit', loadComponent: () => import('./features/council/council-form/council-form').then(m => m.CouncilForm) },
  { path: 'agents', loadComponent: () => import('./features/agent/agent-list/agent-list').then(m => m.AgentList) },
  { path: 'agents/new', loadComponent: () => import('./features/agent/agent-form/agent-form').then(m => m.AgentForm) },
  { path: 'agents/:id/edit', loadComponent: () => import('./features/agent/agent-form/agent-form').then(m => m.AgentForm) },
  { path: 'sessions/:id', loadComponent: () => import('./features/session/session-view/session-view').then(m => m.SessionView) },
];
