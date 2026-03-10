import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home/home').then(m => m.Home) },
  { path: 'councils', loadComponent: () => import('./features/council/council-list/council-list').then(m => m.CouncilList) },
  { path: 'councils/new', loadComponent: () => import('./features/council/council-create/council-create').then(m => m.CouncilCreate) },
  { path: 'agents', loadComponent: () => import('./features/agent/agent-list/agent-list').then(m => m.AgentList) },
  { path: 'agents/new', loadComponent: () => import('./features/agent/agent-create/agent-create').then(m => m.AgentCreate) },
  { path: 'sessions/:id', loadComponent: () => import('./features/session/session-view/session-view').then(m => m.SessionView) },
];
