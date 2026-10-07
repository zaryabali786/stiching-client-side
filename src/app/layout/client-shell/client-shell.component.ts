import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { IonIcon } from '@ionic/angular';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfigService } from '../../core/services/config.service';
import { MailboxService } from '../../core/services/mailbox.service';
import { ChatSocketService } from '../../core/services/chat-socket.service';
import { OrderEventsService } from '../../core/services/order-events.service';
import { ToastService } from '../../core/services/toast.service';
import { copyText } from '../../core/utils/image';
import { ShellUiService } from '../../core/services/shell-ui.service';
import { NotificationModalComponent } from '../../pages/components/notification-modal/notification-modal.component';
import { ChatDockComponent } from '../../shared/chat-dock.component';

type TabKey = 'home' | 'orders' | 'new' | 'sizes' | 'profile' | 'inbox';

/**
 * Persistent chrome for every /app/* page: header (brand, customer code, bell), one scroll area
 * holding the routed page, and one bottom tab bar. Only the routed page is created/destroyed on
 * navigation, so the header and tab bar never re-render or blink.
 */
@Component({
  selector: 'app-client-shell',
  imports: [RouterOutlet, RouterLink, IonIcon, NotificationModalComponent, ChatDockComponent],
  templateUrl: './client-shell.component.html',
  styleUrl: './client-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientShellComponent {
  protected auth = inject(AuthService);
  protected notif = inject(NotificationService);
  protected config = inject(ConfigService);
  /** Instantiated here so the live connection (and bell refreshes) runs on every page. */
  private chatSocket = inject(ChatSocketService);
  private orderEvents = inject(OrderEventsService);
  /** Instantiated here so the Inbox badge stays live on every page. */
  protected mailbox = inject(MailboxService);
  private router = inject(Router);
  private shellUi = inject(ShellUiService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private copiedTimer?: ReturnType<typeof setTimeout>;

  /** Brief tick on the code pill after copying. */
  protected copied = signal(false);
  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  private url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** The order wizard and pages with their own sticky action bar are focused tasks: no tab bar. */
  protected focusMode = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    const wizard = path.startsWith('/app/orders/new') || /^\/app\/orders\/[^/]+\/edit/.test(path);
    // a page with its own sticky action bar (order page: Pay / Approve / Edit order) also takes the full height
    return wizard || this.shellUi.hideTabbar();
  });

  protected activeTab = computed<TabKey>(() => {
    const path = this.url().split(/[?#]/)[0];
    if (path.startsWith('/app/orders/new') || /^\/app\/orders\/[^/]+\/edit/.test(path)) return 'new';
    if (path.startsWith('/app/orders')) return 'orders';
    if (path.startsWith('/app/sizes')) return 'sizes';
    if (path.startsWith('/app/profile')) return 'profile';
    if (path.startsWith('/app/inbox')) return 'inbox';
    return 'home';
  });

  /** The chat button re-clamps itself when the bars at the bottom change (tab bar, sticky action bar). */
  protected dockLayout = computed(() => `${this.focusMode()}|${this.activeTab()}`);

  protected badge = computed(() => {
    const n = this.notif.unreadCount();
    return n > 99 ? '99+' : String(n);
  });

  protected mailBadge = computed(() => {
    const n = this.mailbox.unread();
    return n > 99 ? '99+' : String(n);
  });

  constructor() {
    this.config.load();
    // Scroll the content area (not the window – it never scrolls) to the top on every navigation.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.scroller()?.nativeElement.scrollTo({ top: 0 }));
    this.destroyRef.onDestroy(() => clearTimeout(this.copiedTimer));
  }

  async copyCode(code: string): Promise<void> {
    if (await copyText(code)) {
      this.toast.success(`Customer code ${code} copied — write it on every parcel label.`);
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
    } else {
      this.toast.error('Could not copy — your code is ' + code + '.');
    }
  }
}
