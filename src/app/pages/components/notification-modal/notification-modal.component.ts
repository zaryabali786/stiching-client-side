import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { NotificationService } from '../../../core/services/notification.service';
import { ToastService } from '../../../core/services/toast.service';
import { AppNotification, NotificationType } from '../../../core/models/api.models';
import { SheetComponent } from '../../../shared/sheet.component';
import { EmptyStateComponent, ErrorStateComponent } from '../../../shared/ui-states';
import { TimeAgoPipe } from '../../../shared/time-ago.pipe';

/** The picture of a notification (assets/notif/<name>.svg), from what it says: shipped, paid, invoice, packed, or an approval to give. */
type Pic = 'shipped' | 'paid' | 'invoice' | 'packed' | 'approval' | 'alert';

const TYPE_ICONS: Record<NotificationType, string> = {
  order: 'cube-outline',
  update: 'sparkles-outline',
  alert: 'alert-circle-outline',
  approval: 'checkmark-circle-outline',
  invoice: 'receipt-outline',
  logistics: 'airplane-outline',
};

/** Notification centre opened from the header bell (rendered once, by the shell). */
@Component({
  selector: 'app-notification-modal',
  imports: [NgTemplateOutlet, IonIcon, IonSpinner, SheetComponent, EmptyStateComponent, ErrorStateComponent, TimeAgoPipe],
  templateUrl: './notification-modal.component.html',
  styleUrl: './notification-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationModalComponent {
  protected notif = inject(NotificationService);
  private router = inject(Router);
  private toast = inject(ToastService);

  /** Short call to action for the notification types that need something from the customer. */
  actionLabel(type: NotificationType): string | null {
    return type === 'approval' ? 'Review and Approve' : type === 'invoice' ? 'Pay' : null;
  }

  /** The picture of a notification, from what it says. Every notification has one of the six: a problem, shipping, payment, approval, an invoice or a form to fill in, or (for the rest) our own mark. */
  pic(item: AppNotification): Pic {
    const t = (item.title || '').toLowerCase();
    if (item.type === 'alert' || /failed|not valid|problem|issue/.test(t)) return 'alert';
    if (item.type === 'logistics' || /^(shipped|delivered)|on its way|on the way|dispatch|tracking added/.test(t)) return 'shipped';
    if (/payment confirmed|^paid|payment received/.test(t)) return 'paid';
    if (item.type === 'approval' || /approval needed|qc passed/.test(t)) return 'approval';
    if (item.type === 'invoice' || /invoice|payment required|add your sizes|confirm where/.test(t)) return 'invoice';
    return 'packed';
  }

  /** New (not read yet) and older messages, each under its own small heading. */
  newItems = computed(() => this.notif.items().filter((n) => !n.read_at));
  olderItems = computed(() => this.notif.items().filter((n) => !!n.read_at));

  icon(type: NotificationType): string {
    return TYPE_ICONS[type] ?? 'notifications-outline';
  }

  close(): void {
    this.notif.closeModal();
  }

  open(item: AppNotification): void {
    this.notif.markRead(item);
    if (item.link) {
      this.notif.closeModal();
      this.router.navigateByUrl(item.link, { onSameUrlNavigation: 'reload' }).catch(() => this.toast.error('That link is no longer available.'));
    }
  }

  markAll(): void {
    this.notif.markAllRead((err) => this.toast.error(err));
  }

  dismiss(event: Event, item: AppNotification): void {
    event.stopPropagation();
    this.notif.remove(item, (err) => this.toast.error(err));
  }
}
