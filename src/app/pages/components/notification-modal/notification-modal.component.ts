import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { NotificationService } from '../../../core/services/notification.service';
import { ToastService } from '../../../core/services/toast.service';
import { AppNotification, NotificationType } from '../../../core/models/api.models';
import { SheetComponent } from '../../../shared/sheet.component';
import { EmptyStateComponent, ErrorStateComponent } from '../../../shared/ui-states';
import { TimeAgoPipe } from '../../../shared/time-ago.pipe';

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
  imports: [IonIcon, IonSpinner, SheetComponent, EmptyStateComponent, ErrorStateComponent, TimeAgoPipe],
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
    return type === 'approval' ? 'Review & approve' : type === 'invoice' ? 'Pay' : null;
  }

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
