import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home.component').then((m) => m.HomeComponent),
    title: 'Setlisten',
  },
  {
    path: 'import',
    loadComponent: () => import('./pages/import.component').then((m) => m.ImportComponent),
    title: 'Importieren',
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings.component').then((m) => m.SettingsComponent),
    title: 'Einstellungen',
  },
  {
    path: 'l/:id',
    loadComponent: () => import('./pages/setlist.component').then((m) => m.SetlistComponent),
  },
  {
    path: 'l/:id/play',
    loadComponent: () => import('./pages/perform.component').then((m) => m.PerformComponent),
  },
  { path: '**', redirectTo: '' },
];
