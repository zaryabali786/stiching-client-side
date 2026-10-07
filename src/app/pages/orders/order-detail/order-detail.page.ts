import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, LOCALE_ID, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe, formatNumber } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { Observable, Subject, Subscription, debounceTime, filter } from 'rxjs';
import { ShellUiService } from '../../../core/services/shell-ui.service';
import { OrderService } from '../../../core/services/order.service';
import { ToastService } from '../../../core/services/toast.service';
import { NotificationService } from '../../../core/services/notification.service';
import { OrderEventsService } from '../../../core/services/order-events.service';
import { ApiResult, InvoiceLine, OrderDetail, OrderUnit } from '../../../core/models/api.models';
import { PROGRESS_STEPS, humanizeStatus, progressIndex, statusHint } from '../../../core/utils/order-status';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';
import { ShipToCardComponent } from '../../../shared/ship-to-card.component';
import { ErrorStateComponent, SkeletonComponent } from '../../../shared/ui-states';
import { ChatService } from '../../../core/services/chat.service';
import { ChatSocketService } from '../../../core/services/chat-socket.service';
import { ChatUiService } from '../../../core/services/chat-ui.service';
import { ConversationScope, UnitTimelineStep } from '../../../core/models/api.models';
import { SizeSummaryComponent } from '../../../shared/size-summary.component';
import { VoicePlayerComponent } from '../../../shared/voice-player.component';
import { VoiceNoteFieldComponent } from '../../../shared/voice-note-field.component';
import { VoiceNote } from '../../../core/models/api.models';
import { isStoredVoice, toVoiceRef } from '../../../core/utils/voice-note';
import { PaymentSheetComponent } from '../../../shared/payment-sheet.component';

type Action = 'cancel' | 'approve' | 'changes' | 'pay' | 'discard';

/** Key of the single order-level approval card used by old orders (no per-article approval data). */
export const LEGACY_KEY = '__order';

@Component({
  selector: 'app-order-detail',
  imports: [
    RouterLink,
    FormsModule,
    DatePipe,
    DecimalPipe,
    IonIcon,
    IonSpinner,
    StatusBadgeComponent,
    ShipToCardComponent,
    SkeletonComponent,
    ErrorStateComponent,
    SizeSummaryComponent,
    PaymentSheetComponent,
    VoicePlayerComponent,
    VoiceNoteFieldComponent,
  ],
  templateUrl: './order-detail.page.html',
  styleUrl: './order-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailPage {
  private orders = inject(OrderService);
  private toast = inject(ToastService);
  private notif = inject(NotificationService);
  private events = inject(OrderEventsService);
  private chatApi = inject(ChatService);
  private socket = inject(ChatSocketService);
  private chatUi = inject(ChatUiService);
  private router = inject(Router);
  private shellUi = inject(ShellUiService);
  private destroyRef = inject(DestroyRef);
  private locale = inject(LOCALE_ID);

  /** Route param + `?created=1` query param (component input binding). */
  readonly id = input.required<string>();
  readonly created = input<string>();
  /** `?chat=1` (notification link): open the chat sheet; with `&unit=<id>` on that article's chat. */
  readonly chat = input<string>();
  /** `?focus=approval` (approval notification): scroll to the approval card and focus Approve. */
  readonly focus = input<string>();
  /** `?unit=<id>` next to `focus=approval`: the article whose card to open. */
  readonly unit = input<string>();

  readonly steps = PROGRESS_STEPS;

  order = signal<OrderDetail | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  pending = signal<Action | null>(null);
  confirmCancel = signal(false);
  /** Asking before a draft made from an email is thrown away. */
  confirmDiscard = signal(false);
  /** Which approval card has its change box open (a unit id, or LEGACY_KEY). */
  changesFor = signal<string | null>(null);
  /** The approval action in flight: `<unit id>`, `__all` or LEGACY_KEY. */
  pendingKey = signal<string | null>(null);
  /** Approved pieces whose photos are unfolded. */
  photosOpen = signal<ReadonlySet<string>>(new Set());
  changeNote = signal('');
  changeAudio = signal<VoiceNote | null | undefined>(undefined);
  changeAudioBusy = signal(false);
  /** Send needs written text (3+ characters) or a voice note. */
  canSendChanges = computed(() => this.changeNote().trim().length >= 3 || isStoredVoice(this.changeAudio()));
  viewer = signal<string | null>(null);
  showCreated = signal(false);
  /** Brief highlight of the approval card after arriving from a notification. */
  flashKey = signal<string | null>(null);
  /** The order-level timeline section is collapsed until opened. */
  orderTimelineOpen = signal(false);
  /** Articles whose own timeline was toggled by hand (otherwise: open when it has 3 steps or fewer). */
  private unitTimelineToggled = signal<ReadonlyMap<string, boolean>>(new Map());
  /** Expanded unit IDs for article accordion (first unit open by default). */
  expandedUnits = signal<ReadonlySet<string>>(new Set());

  allUnitsExpanded = computed(() => {
    const o = this.order();
    if (!o || !o.units.length) return false;
    const current = this.expandedUnits();
    return o.units.every((u) => current.has(u.id));
  });

  isUnitExpanded(unitId: string): boolean {
    return this.expandedUnits().has(unitId);
  }

  toggleUnit(unitId: string): void {
    this.expandedUnits.update((set) => {
      const next = new Set(set);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }

  toggleAllUnits(): void {
    const o = this.order();
    if (!o || !o.units.length) return;
    if (this.allUnitsExpanded()) {
      this.expandedUnits.set(new Set());
    } else {
      this.expandedUnits.set(new Set(o.units.map((u) => u.id)));
    }
  }

  // Chats: General + one per article. The sheet and the floating button live in the app shell (ChatUiService);
  // this page keeps the per-article unread badges and opens an article's own chat from its card.
  scopes = signal<ConversationScope[]>([]);
  private scopesLoaded = signal(false);
  private scopeRefresh$ = new Subject<void>();
  private chatLinkPending = false;

  stepIndex = computed(() => {
    const o = this.order();
    return o ? progressIndex(o.status) : 0;
  });
  /** Articles waiting for the customer's decision. */
  pendingUnits = computed(() => (this.order()?.units ?? []).filter((u) => u.approval?.status === 'pending'));
  /** Articles that have (or had) photos sent: cards in every state except "none". */
  approvalUnits = computed(() => (this.order()?.units ?? []).filter((u) => !!u.approval && u.approval.status !== 'none'));
  /** Old orders: awaiting approval but no article has approval photos, so show the order-level photos once. */
  legacyApproval = computed(() => {
    const o = this.order();
    return !!o && o.status === 'customer_approval' && !o.units.some((u) => (u.approval?.photos?.length ?? 0) > 0);
  });
  waitingCount = computed(() => this.pendingUnits().length || (this.legacyApproval() ? 1 : 0));
  hint = computed(() => {
    const o = this.order();
    if (!o) return '';
    const n = this.pendingUnits().length;
    if (o.status === 'customer_approval' && n > 0) return `${n} of ${o.units.length} article${o.units.length === 1 ? '' : 's'} waiting for your approval`;
    return statusHint(o.status);
  });
  issueUnits = computed(() => (this.order()?.units ?? []).filter((u) => u.status === 'issue'));
  totalPieces = computed(() => (this.order()?.units ?? []).reduce((s, u) => s + (u.quantity || 1), 0));
  timeline = computed(() => [...(this.order()?.events ?? [])].reverse());
  isAwaitingPayment = computed(() => {
    const o = this.order();
    return !!o && ['awaiting_payment', 'invoice_issued'].includes(o.status) && o.invoice?.status === 'issued';
  });
  paidInvoice = computed(() => {
    const inv = this.order()?.invoice;
    return inv && inv.status === 'paid' ? inv : null;
  });

  /** Invoice billed in a currency other than PKR (diaspora customers). */
  isForeign = computed(() => {
    const inv = this.order()?.invoice;
    return !!inv && !!inv.currency && inv.currency !== 'PKR';
  });
  /** "GBP 70.99" (invoice currency) or "PKR 26,200" — used on the Pay button and amount due. */
  payAmount = computed(() => {
    const inv = this.order()?.invoice;
    if (!inv) return '';
    return this.isForeign()
      ? `${inv.currency} ${formatNumber(inv.total_foreign, this.locale, '1.2-2')}`
      : `PKR ${formatNumber(inv.total_pkr, this.locale, '1.0-0')}`;
  });
  nextStep = computed(() => {
    const o = this.order();
    if (!o || o.status === 'cancelled' || o.status === 'delivered') return null;
    return this.steps[this.stepIndex() + 1] ?? null;
  });

  private sub?: Subscription;
  private pendingFocus = false;
  private pendingUnit: string | undefined;
  /** After approving / requesting changes: move focus to the next waiting card (or the status card). */
  private focusAfterLoad = false;
  private lastLoadAt = 0;
  private flashTimer?: ReturnType<typeof setTimeout>;

  /** True while a sticky action bar (Pay / Approve / Edit order) is on screen. */
  hasActionBar = computed(() => {
    const o = this.order();
    if (!o) return false;
    if (this.isAwaitingPayment() && o.invoice) return true;
    if (o.status === 'draft') return !this.confirmDiscard();
    return o.status === 'submitted' && !this.confirmCancel();
  });

  constructor() {
    // the action bar replaces the bottom tab bar while it is showing
    effect(() => this.shellUi.hideTabbar.set(this.hasActionBar()));
    this.destroyRef.onDestroy(() => this.shellUi.hideTabbar.set(false));
    // Tell the shell which order is on screen: the app-wide chat button then opens this order's General chat.
    effect(() => {
      const o = this.order();
      this.chatUi.pageOrder.set(o ? { id: o.id, reference: o.reference } : null);
    });
    this.destroyRef.onDestroy(() => this.chatUi.pageOrder.set(null));
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    effect(() => {
      if (this.created()) untracked(() => this.showCreated.set(true));
    });
    // ?focus=approval: wait for fresh data (the photos may have just arrived), then bring the card into view.
    effect(() => {
      if (this.focus() !== 'approval') return;
      untracked(() => {
        this.pendingFocus = true;
        this.pendingUnit = this.unit();
        if (this.order()) this.load(this.id(), true);
      });
    });
    // Live status changes for this order, and a notification link to the page we are already on.
    this.events.updated$.pipe(filter((e) => e.orderId === this.id()), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load(this.id(), true));
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        if (path === `/app/orders/${this.id()}` && Date.now() - this.lastLoadAt > 1000) this.load(this.id(), true);
      });
    this.destroyRef.onDestroy(() => clearTimeout(this.flashTimer));

    // Chats: join the order's room (all its chats), keep the unread badges fresh.
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.scopesLoaded.set(false);
        this.scopes.set([]);
        this.socket.join(id);
        this.loadScopes();
        this.destroyRef.onDestroy(() => this.socket.leave(id));
      });
    });
    this.scopeRefresh$.pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadScopes());
    this.socket.messageNew$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((m) => {
      if (m.order_id !== this.id()) return;
      this.scopeRefresh$.next();
    });
    this.chatUi.read$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((orderId) => orderId === this.id() && this.loadScopes());
    this.socket.messageRead$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((e) => e.orderId === this.id() && this.scopeRefresh$.next());
    this.socket.reconnected$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.scopeRefresh$.next());

    // ?chat=1 [&unit=<id>]: open the sheet (once the chats are known), then drop the params.
    effect(() => {
      if (!this.chat()) return;
      untracked(() => {
        this.chatLinkPending = true;
        this.openChatLinkIfReady();
      });
    });
  }

  // ───────── chats ─────────

  loadScopes(): void {
    this.chatApi
      .scopes(this.id())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ scopes }) => {
          this.scopes.set(scopes);
          this.scopesLoaded.set(true);
          this.openChatLinkIfReady();
        },
        error: () => undefined,
      });
  }

  scopeUnread(unitId: string): number {
    return this.scopes().find((s) => s.unit_id === unitId)?.unread ?? 0;
  }

  /** Open the chat sheet on General (default) or on one article's chat. */
  openChat(unitId?: string | null): void {
    const o = this.order();
    if (!o) return;
    const unit = unitId || 'general';
    const title =
      unit === 'general'
        ? 'Chat'
        : `Chat about: ${this.scopes().find((s) => s.unit_id === unit)?.title ?? o.units.find((x) => x.id === unit)?.unit_title ?? 'this article'}`;
    this.chatUi.openChat({ orderId: o.id, reference: o.reference, unitId: unit, title });
  }

  private openChatLinkIfReady(): void {
    if (!this.chatLinkPending || !this.scopesLoaded() || !this.order()) return;
    this.chatLinkPending = false;
    const scopes = this.scopes();
    const wanted = this.unit();
    // `?chat=1` is General; `&unit=<id>` that article's chat only.
    const pick = wanted ? scopes.find((s) => s.unit_id === wanted) : null;
    this.openChat(pick?.unit_id ?? null);
    void this.router.navigate([], { queryParams: { chat: null, ...(this.focus() ? {} : { unit: null }) }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  // ───────── timelines ─────────

  timelineOpenFor(u: OrderUnit): boolean {
    return this.unitTimelineToggled().get(u.id) ?? (u.timeline?.length ?? 0) <= 3;
  }

  toggleUnitTimeline(u: OrderUnit): void {
    const open = this.timelineOpenFor(u);
    this.unitTimelineToggled.update((m) => new Map(m).set(u.id, !open));
  }

  stepsNewestFirst(u: OrderUnit): UnitTimelineStep[] {
    return [...(u.timeline ?? [])].reverse();
  }

  latestStep(u: OrderUnit): UnitTimelineStep | null {
    return u.timeline?.length ? u.timeline[u.timeline.length - 1] : null;
  }

  /** Accent for a step: amber = waiting on you / sent back, green = passed or done, red = problem. */
  stepTone(status: string): 'amber' | 'green' | 'red' | 'blue' {
    if (['approval_requested', 'changes_requested', 'qc_failed'].includes(status)) return 'amber';
    if (['qc_passed', 'approved', 'packed', 'issue_resolved', 'shipped', 'delivered'].includes(status)) return 'green';
    if (status === 'issue') return 'red';
    return 'blue';
  }

  load(id = this.id(), silent = false): void {
    this.sub?.unsubscribe();
    this.lastLoadAt = Date.now();
    if (!silent) {
      this.loading.set(true);
      this.error.set(null);
    }
    this.sub = this.orders
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (o) => {
          this.order.set(o);
          this.loading.set(false);
          this.error.set(null);
          if (this.expandedUnits().size === 0 && o.units?.length) {
            const target = this.unit();
            if (target && o.units.some((u) => u.id === target)) {
              this.expandedUnits.set(new Set([target]));
            } else {
              this.expandedUnits.set(new Set([o.units[0].id]));
            }
          }
          this.openChatLinkIfReady();
          if (this.pendingFocus) {
            this.pendingFocus = false;
            const unit = this.pendingUnit;
            setTimeout(() => this.handleFocus(o, unit), 250);
          } else if (this.focusAfterLoad) {
            this.focusAfterLoad = false;
            setTimeout(() => this.focusNextApproval(), 200);
          }
        },
        error: (err: Error) => {
          this.loading.set(false);
          if (!silent || !this.order()) this.error.set(err.message);
          else this.toast.error(err);
        },
      });
  }

  // ───────── actions ─────────

  private run(action: Action, req$: Observable<ApiResult<unknown>>, after?: () => void, key: string | null = null): void {
    if (this.pending()) return;
    this.pending.set(action);
    this.pendingKey.set(key);
    req$.subscribe({
      next: ({ message }) => {
        this.pending.set(null);
        this.pendingKey.set(null);
        this.toast.success(message || 'Done.');
        after?.();
        this.load(this.id(), true);
        this.notif.refreshCount();
      },
      error: (err) => {
        this.pending.set(null);
        this.pendingKey.set(null);
        this.toast.error(err);
      },
    });
  }

  /** Throw a draft made from an email away; the email's order stays available in the Inbox. */
  discardDraft(): void {
    if (this.pending()) return;
    this.pending.set('discard');
    this.orders.discardDraft(this.id()).subscribe({
      next: ({ message }) => {
        this.pending.set(null);
        this.toast.success(message || 'Draft discarded.');
        this.notif.refreshCount();
        void this.router.navigate(['/app/orders']);
      },
      error: (err) => {
        this.pending.set(null);
        this.toast.error(err);
      },
    });
  }

  cancelOrder(): void {
    this.run('cancel', this.orders.cancel(this.id()), () => this.confirmCancel.set(false));
  }

  /** Approve one piece (`unitId`), the old order-level card (LEGACY_KEY) or every waiting piece (undefined). */
  approve(unitId?: string): void {
    const key = unitId ?? '__all';
    this.focusAfterLoad = true;
    this.run('approve', this.orders.approve(this.id(), unitId && unitId !== LEGACY_KEY ? unitId : undefined), undefined, key);
  }

  requestChanges(key: string): void {
    const note = this.changeNote().trim();
    const audio = this.changeAudio();
    if (this.changeAudioBusy()) {
      this.toast.info('Your voice note is still saving. One moment.');
      return;
    }
    if (note.length < 3 && !isStoredVoice(audio)) {
      this.toast.error('Please write the change you need or add a voice note.');
      return;
    }
    this.focusAfterLoad = true;
    this.run(
      'changes',
      this.orders.requestChanges(this.id(), {
        ...(key !== LEGACY_KEY ? { unit_id: key } : {}),
        ...(note.length >= 3 ? { note } : {}),
        ...(isStoredVoice(audio) ? { audio: toVoiceRef(audio) } : {}),
      }),
      () => this.closeChanges(),
      key,
    );
  }

  closeChanges(): void {
    this.changesFor.set(null);
    this.changeNote.set('');
    this.changeAudio.set(undefined);
  }

  togglePhotos(id: string): void {
    this.photosOpen.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Opens the Stripe card sheet; the order refreshes when the payment is confirmed. */
  payOpen = signal(false);

  pay(): void {
    this.payOpen.set(true);
  }

  onPaid(): void {
    this.payOpen.set(false);
    this.load(this.id(), true);
    this.notif.refreshCount();
  }

  /** A voice note's signed link failed to load: quietly reload the order for fresh links (at most every 20 s). */
  private lastAudioReload = 0;
  onAudioFailed(): void {
    if (Date.now() - this.lastAudioReload < 20_000) return;
    this.lastAudioReload = Date.now();
    this.load(this.id(), true);
  }

  /** Brings a waiting card into view, highlights it and focuses its Approve button. */
  private showApprovalCard(key: string, smooth = true): void {
    document.getElementById('approval-' + key)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
    this.flashKey.set(key);
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flashKey.set(null), 2800);
    setTimeout(() => document.getElementById('approve-' + key)?.focus({ preventScroll: true }), 350);
  }

  /** Approval notification (`?focus=approval&unit=<id>`): open that card, or the first waiting one; then drop the params. */
  private handleFocus(o: OrderDetail, unit?: string): void {
    const stripped = this.router.navigate([], { queryParams: { focus: null, unit: null }, queryParamsHandling: 'merge', replaceUrl: true });
    const pending = o.units.filter((u) => u.approval?.status === 'pending');
    const key = unit ? (pending.some((u) => u.id === unit) ? unit : null) : (pending[0]?.id ?? (this.legacyApproval() ? LEGACY_KEY : null));
    if (!key) {
      this.toast.info('Already handled');
      return;
    }
    // The shell scrolls to the top after every navigation: scroll to the card only once that has happened.
    void stripped.then(() => setTimeout(() => this.showApprovalCard(key), 60));
  }

  private focusNextApproval(): void {
    const next = this.pendingUnits()[0]?.id ?? (this.legacyApproval() ? LEGACY_KEY : null);
    const target = (next && document.getElementById('approve-' + next)) || document.getElementById('status-card');
    target?.focus({ preventScroll: next === null });
    if (!next) document.getElementById('status-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Open a card's change box and focus its text field. */
  openChanges(key: string): void {
    if (this.changesFor() !== key) {
      this.changeNote.set('');
      this.changeAudio.set(undefined);
    }
    this.changesFor.set(key);
    setTimeout(() => {
      const el = document.getElementById('changeNote-' + key) as HTMLTextAreaElement | null;
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus({ preventScroll: true });
    });
  }

  dismissCreated(): void {
    this.showCreated.set(false);
    this.router.navigate([], { queryParams: { created: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  // ───────── helpers ─────────

  stepState(i: number): 'done' | 'current' | 'todo' {
    const idx = this.stepIndex();
    if (this.order()?.status === 'delivered') return 'done';
    return i < idx ? 'done' : i === idx ? 'current' : 'todo';
  }

  unitTone(status: string): string {
    return status === 'issue' ? 'tone-red' : status === 'received' ? 'tone-blue' : '';
  }

  unitLabel(status: string): string {
    return status === 'pending' ? 'Awaiting parcel' : status === 'received' ? 'Received' : 'Issue';
  }

  lineAmount(line: InvoiceLine): number {
    return line.kind === 'discount' ? -Math.abs(line.customer_amount) : line.customer_amount;
  }

  /** Express / Standard, from the customer's international-shipping answer. */
  shippingText(o: OrderDetail): string {
    const express = o.international_shipping ?? o.shipping_service === 'express';
    return express ? 'Express (international)' : 'Standard (local)';
  }

  hostOf(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  /** Neckline / sleeves / trouser text for orders placed before article types existed. */
  designText(u: OrderUnit): string {
    const d = u.design ?? {};
    return [d.neckline && `${d.neckline} neck`, d.sleeves && `${d.sleeves} sleeves`, d.trouser && `${d.trouser} trouser`]
      .filter(Boolean)
      .join(' · ');
  }

  destination(o: OrderDetail): string {
    return [o.destination_address, o.destination_city, o.destination_country].filter((x) => !!x).join(', ') || '—';
  }

  eventLabel(status: string): string {
    return humanizeStatus(status);
  }

  isImage(type: string | undefined, url: string): boolean {
    return !type || type.startsWith('image') || /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(url);
  }

  @HostListener('document:keydown.escape')
  closeViewer(): void {
    this.viewer.set(null);
  }
}
