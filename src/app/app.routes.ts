import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'app/overview', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in',
    loadComponent: () => import('./pages/auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    title: 'Create account',
    loadComponent: () => import('./pages/auth/register/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/client-shell/client-shell.component').then((m) => m.ClientShellComponent),
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      {
        path: 'overview',
        title: 'Home',
        loadComponent: () => import('./pages/overview/overview.page').then((m) => m.OverviewPage),
      },
      {
        path: 'orders',
        title: 'Orders',
        loadComponent: () => import('./pages/orders/orders-list/orders-list.page').then((m) => m.OrdersListPage),
      },
      {
        path: 'orders/new',
        title: 'New order',
        loadComponent: () => import('./pages/orders/order-form/order-form.page').then((m) => m.OrderFormPage),
      },
      {
        path: 'orders/:id/edit',
        title: 'Edit order',
        loadComponent: () => import('./pages/orders/order-form/order-form.page').then((m) => m.OrderFormPage),
      },
      {
        path: 'orders/:id',
        title: 'Order',
        loadComponent: () => import('./pages/orders/order-detail/order-detail.page').then((m) => m.OrderDetailPage),
      },
      {
        path: 'sizes',
        title: 'Sizes',
        loadComponent: () => import('./pages/sizes/sizes.page').then((m) => m.SizesPage),
      },
      {
        path: 'profile',
        title: 'Profile',
        loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage),
      },
      { path: '**', redirectTo: 'overview' },
    ],
  },
  { path: '**', redirectTo: 'app/overview' },
];
