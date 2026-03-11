import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home/home').then(m => m.Home) },
  { path: 'councils', loadComponent: () => import('./features/council/council-list/council-list').then(m => m.CouncilList) },
  { path: 'councils/new', loadComponent: () => import('./features/council/council-form/council-form').then(m => m.CouncilForm) },
  { path: 'councils/:id/edit', loadComponent: () => import('./features/council/council-form/council-form').then(m => m.CouncilForm) },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin-dashboard/admin-dashboard').then(m => m.AdminDashboard),
    children: [
      { path: '', redirectTo: 'agents', pathMatch: 'full' },
      { path: 'agents', loadComponent: () => import('./features/admin/agents/agent-config/agent-config').then(m => m.AgentConfig) },
      { path: 'stats', loadComponent: () => import('./features/admin/stats/stats-dashboard').then(m => m.StatsDashboard) },
      { path: 'tools', loadComponent: () => import('./features/admin/tools/tool-registry').then(m => m.ToolRegistry) },
      { path: 'settings', loadComponent: () => import('./features/admin/settings/admin-settings').then(m => m.AdminSettings) },
      { path: 'logs', loadComponent: () => import('./features/admin/logs/error-log-viewer').then(m => m.ErrorLogViewer) },
    ],
  },
  { path: 'agents', redirectTo: '/admin/agents', pathMatch: 'full' },
  { path: 'sessions', loadComponent: () => import('./features/session/session-list/session-list').then(m => m.SessionList) },
  { path: 'sessions/:id', loadComponent: () => import('./features/session/session-view/session-view').then(m => m.SessionView) },
];
