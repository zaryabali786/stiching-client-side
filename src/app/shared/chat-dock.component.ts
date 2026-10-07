import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { ChatInboxService, InboxChat } from '../core/services/chat-inbox.service';
import { ChatUiService } from '../core/services/chat-ui.service';
import { ChatFabComponent } from './chat-fab.component';
import { ChatPanelComponent } from './chat-panel.component';
import { SheetComponent } from './sheet.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from './ui-states';
import { TimeAgoPipe } from './time-ago.pipe';

/**
 * The customer's chat, available on every page: the draggable floating button plus one bottom sheet.
 * On an order page the button opens that order's General chat; elsewhere it opens the list of the customer's chats and
 * tapping one opens its General chat in the same sheet. Article chats open from their own button on the order page.
 */
@Component({
  selector: 'app-chat-dock',
  imports: [RouterLink, IonIcon, ChatFabComponent, ChatPanelComponent, SheetComponent, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-chat-fab [unread]="fabUnread()" [pulseKey]="pulse()" [layoutKey]="layoutKey()" (activated)="onFab()" />

    <app-sheet [open]="open()" [tall]="true" [flush]="!!target()" [title]="title()" [eyebrow]="eyebrow()" (closed)="ui.close()">
      @if (target(); as t) {
        <div class="wrap">
          @if (t.fromList) {
            <button type="button" class="link-btn back" (click)="ui.openList()">
              <ion-icon name="chevron-back-outline" aria-hidden="true"></ion-icon> All chats
            </button>
          }
          @if (t.unitId === 'general') {
            <p class="about">Anything about this order, for the whole team.</p>
          }
          <app-chat-panel [orderId]="t.orderId" [unitId]="t.unitId" [fill]="true" (read)="onRead(t.orderId)" />
        </div>
      } @else if (ui.listOpen()) {
        @if (inbox.loading() && !inbox.items().length) {
          <app-skeleton variant="tiles" [count]="3" />
        } @else if (inbox.error() && !inbox.items().length) {
          <app-error-state title="Chats didn't load" [message]="inbox.error()!" (retry)="inbox.reload()" />
        } @else if (!inbox.items().length) {
          <app-empty-state icon="chatbubbles-outline" title="No conversations yet" message="Open one of your orders and use its chat button to message our team.">
            <a class="btn btn-outline btn-sm" routerLink="/app/orders" (click)="ui.close()">View my orders</a>
          </app-empty-state>
        } @else {
          <ul class="list" aria-label="Your chats">
            @for (c of inbox.items(); track c.orderId) {
              <li>
                <button type="button" class="row" (click)="openFromList(c)" [attr.aria-label]="rowLabel(c)">
                  <span class="ico" aria-hidden="true"><ion-icon name="chatbubbles-outline"></ion-icon></span>
                  <span class="txt">
                    <span class="top">
                      <strong class="ref">{{ c.reference }}</strong>
                      <time class="when" [attr.datetime]="c.lastAt">{{ c.lastAt | timeAgo }}</time>
                    </span>
                    <span class="prev">{{ c.previewRole === 'customer' ? 'You: ' : '' }}{{ c.preview }}</span>
                    @if (c.otherUnread > 0) {
                      <span class="more">{{ c.otherUnread }} unread in article chats</span>
                    }
                  </span>
                  @if (c.generalUnread > 0) {
                    <span class="unread" aria-hidden="true">{{ c.generalUnread > 99 ? '99+' : c.generalUnread }}</span>
                  }
                </button>
              </li>
            }
          </ul>
        }
      }
    </app-sheet>
  `,
  styles: `
    :host { display: contents; }
    .wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    .wrap app-chat-panel { flex: 1; min-height: 0; }
    .about { margin: 0 0 10px; font-size: var(--fs-md); color: var(--c-muted); }
    .back { align-self: flex-start; min-height: 40px; margin: -6px 0 4px -6px; padding: 0 6px; }
    .back ion-icon { font-size: 16px; }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .row {
      width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px; text-align: left; cursor: pointer;
      background: var(--c-surface); border: 1px solid var(--c-line); border-radius: 16px; color: var(--c-ink);
    }
    .row:hover { border-color: var(--c-line-strong); }
    .row:focus-visible { outline: 2px solid var(--c-focus); outline-offset: 2px; }
    .ico {
      flex: none; width: 42px; height: 42px; border-radius: 12px; background: var(--c-brand-soft); color: var(--c-brand);
      display: flex; align-items: center; justify-content: center; font-size: 22px;
    }
    .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .ref { font-size: var(--fs-body); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .when { flex: none; font-size: var(--fs-xs); color: var(--c-faint); }
    .prev { font-size: var(--fs-md); color: var(--c-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .more { font-size: var(--fs-xs); font-weight: 600; color: var(--c-gold-dark); }
    .unread {
      flex: none; min-width: 24px; height: 24px; padding: 0 7px; border-radius: 999px; background: var(--t-red-dot); color: #fff;
      font-size: var(--fs-xs); font-weight: 700; line-height: 24px; text-align: center; font-variant-numeric: tabular-nums;
    }
  `,
})
export class ChatDockComponent {
  protected ui = inject(ChatUiService);
  protected inbox = inject(ChatInboxService);

  /** Anything that changes the bars at the bottom (tab bar, sticky action bar): the button re-clamps. */
  readonly layoutKey = input<unknown>(null);

  protected target = this.ui.target;
  protected open = computed(() => this.ui.listOpen() || !!this.ui.target());
  protected title = computed(() => this.ui.target()?.title ?? 'Your chats');
  protected eyebrow = computed(() => this.ui.target()?.reference ?? 'Messages');
  /** On an order page the button shows that order's General unread; elsewhere the total over all orders. */
  protected fabUnread = computed(() => {
    const page = this.ui.pageOrder();
    return page ? this.inbox.generalUnreadOf(page.id) : this.inbox.totalUnread();
  });
  /** Bumped when unread grows while the chat is closed (the button pulses). */
  protected pulse = signal(0);

  constructor() {
    let prev: number | null = null;
    effect(() => {
      const n = this.inbox.totalUnread();
      const loaded = this.inbox.loaded();
      untracked(() => {
        if (loaded && prev !== null && n > prev && !this.open()) this.pulse.update((x) => x + 1);
        prev = loaded ? n : null;
      });
    });
  }

  protected onFab(): void {
    const page = this.ui.pageOrder();
    if (page) {
      this.ui.openChat({ orderId: page.id, reference: page.reference, unitId: 'general', title: 'Chat' });
      return;
    }
    this.inbox.reload(true);
    this.ui.openList();
  }

  protected openFromList(c: InboxChat): void {
    this.ui.openChat({ orderId: c.orderId, reference: c.reference, unitId: 'general', title: 'Chat' }, true);
  }

  protected onRead(orderId: string): void {
    this.ui.read$.next(orderId);
    this.inbox.refreshOrder(orderId);
  }

  protected rowLabel(c: InboxChat): string {
    return `Open chat for ${c.reference}${c.generalUnread > 0 ? `, ${c.generalUnread} unread` : ''}`;
  }
}
