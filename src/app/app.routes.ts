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
    path: 'reset-password',
    title: 'Choose a new password',
    loadComponent: () => import('./pages/auth/reset-password/reset-password.page').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'sign-in',
    title: 'Sign in with a code',
    loadComponent: () => import('./pages/auth/sign-in-code/sign-in-code.page').then((m) => m.SignInCodePage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    title: 'Create account',
    loadComponent: () => import('./pages/auth/register/register.page').then((m) => m.RegisterPage),
  },
  {
    // where Stripe Checkout returns the customer (no sign-in needed: the page only reports, the server checks the payment)
    path: 'pay-return',
    title: 'Payment',
    loadComponent: () => import('./pages/pay-return/pay-return.page').then((m) => m.PayReturnPage),
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
        path: 'shop',
        title: 'Shop',
        loadComponent: () => import('./pages/shop/shop-browse/shop-browse.page').then((m) => m.ShopBrowsePage),
      },
      {
        path: 'shop/product/:id',
        title: 'Product',
        loadComponent: () => import('./pages/shop/shop-product/shop-product.page').then((m) => m.ShopProductPage),
      },
      {
        path: 'shop/cart',
        title: 'Cart',
        loadComponent: () => import('./pages/shop/shop-cart/shop-cart.page').then((m) => m.ShopCartPage),
      },
      {
        path: 'shop/orders',
        title: 'Shop orders',
        loadComponent: () => import('./pages/shop/shop-orders/shop-orders.page').then((m) => m.ShopOrdersPage),
      },
      {
        path: 'shop/orders/:id',
        title: 'Shop order',
        loadComponent: () => import('./pages/shop/shop-order/shop-order.page').then((m) => m.ShopOrderPage),
      },
      {
        path: 'approvals',
        title: 'Approvals',
        loadComponent: () => import('./pages/approvals/approvals.page').then((m) => m.ApprovalsPage),
      },
      {
        path: 'inbox',
        title: 'Inbox',
        loadComponent: () => import('./pages/inbox/inbox.page').then((m) => m.InboxPage),
      },
      {
        path: 'inbox/:id',
        title: 'Email',
        loadComponent: () => import('./pages/inbox/inbox.page').then((m) => m.InboxPage),
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
