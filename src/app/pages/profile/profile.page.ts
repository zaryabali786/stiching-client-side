import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MailboxService } from '../../core/services/mailbox.service';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/services/api.service';
import { copyText } from '../../core/utils/image';
import { ShipToCardComponent } from '../../shared/ship-to-card.component';
import { COUNTRIES, passwordStrength } from '../auth/register/register.data';

@Component({
  selector: 'app-profile',
  imports: [DatePipe, RouterLink, FormsModule, IonIcon, IonSpinner, ShipToCardComponent],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  protected auth = inject(AuthService);
  private toast = inject(ToastService);
  protected mailbox = inject(MailboxService);

  readonly countries = COUNTRIES;
  user = this.auth.user;
  initial = computed(() => (this.user()?.full_name || this.user()?.email || '?').charAt(0).toUpperCase());

  // Edit profile
  editing = signal(false);
  saving = signal(false);
  profileError = signal<string | null>(null);
  fullName = signal('');
  phone = signal('');
  country = signal('');
  otherCountry = signal('');
  city = signal('');
  address = signal('');
  postalCode = signal('');

  // Change password
  pwOpen = signal(false);
  currentPassword = signal('');
  newPassword = signal('');
  confirmPassword = signal('');
  showPw = signal(false);
  changingPw = signal(false);
  pwError = signal<string | null>(null);
  strength = computed(() => passwordStrength(this.newPassword()));

  loggingOut = signal(false);

  startEdit(): void {
    const u = this.user();
    if (!u) return;
    const knownCountry = !u.country || (COUNTRIES as readonly string[]).includes(u.country);
    this.fullName.set(u.full_name ?? '');
    this.phone.set(u.phone ?? '');
    this.country.set(knownCountry ? (u.country ?? '') : 'Other');
    this.otherCountry.set(knownCountry ? '' : (u.country ?? ''));
    this.city.set(u.city ?? '');
    this.address.set(u.address ?? '');
    this.postalCode.set(u.postal_code ?? '');
    this.profileError.set(null);
    this.editing.set(true);
  }

  async saveProfile(): Promise<void> {
    const country = this.country() === 'Other' ? this.otherCountry().trim() : this.country();
    if (this.fullName().trim().length < 2) {
      this.profileError.set('Enter your full name.');
      return;
    }
    if (!country || !this.city().trim() || this.address().trim().length < 5) {
      this.profileError.set('Country, city and address are needed so we can deliver to you.');
      return;
    }
    this.saving.set(true);
    this.profileError.set(null);
    try {
      const message = await this.auth.updateProfile({
        fullName: this.fullName().trim(),
        phone: this.phone().trim(),
        country,
        city: this.city().trim(),
        address: this.address().trim(),
        postalCode: this.postalCode().trim(),
      });
      this.toast.success(message || 'Profile updated.');
      this.editing.set(false);
    } catch (err) {
      this.profileError.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  async changePassword(): Promise<void> {
    this.pwError.set(null);
    if (!this.currentPassword()) {
      this.pwError.set('Enter your current password.');
      return;
    }
    if (this.newPassword().length < 8) {
      this.pwError.set('New password must be at least 8 characters.');
      return;
    }
    if (this.newPassword() !== this.confirmPassword()) {
      this.pwError.set('New passwords do not match.');
      return;
    }
    this.changingPw.set(true);
    try {
      const message = await this.auth.changePassword(this.currentPassword(), this.newPassword());
      this.toast.success(message || 'Password changed.');
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
      this.pwOpen.set(false);
    } catch (err) {
      this.pwError.set(errorMessage(err));
    } finally {
      this.changingPw.set(false);
    }
  }

  /** The personal shopping email shown on the profile (type it at any shop's checkout; the mail lands in the Inbox). */
  shoppingEmail = computed(() => this.user()?.mailbox_address ?? null);
  mailCopied = signal(false);

  async copyShoppingEmail(): Promise<void> {
    const a = this.shoppingEmail();
    if (!a) return;
    if (await copyText(a)) {
      this.toast.success("Shopping email copied — paste it at the shop's checkout.");
      this.mailCopied.set(true);
      setTimeout(() => this.mailCopied.set(false), 2000);
    } else {
      this.toast.error('Could not copy — your shopping email is ' + a + '.');
    }
  }

  async copyCode(): Promise<void> {
    const code = this.user()?.customer_code;
    if (!code) return;
    if (await copyText(code)) this.toast.success('Customer code copied.');
  }

  async logout(): Promise<void> {
    this.loggingOut.set(true);
    try {
      await this.auth.logout();
    } finally {
      this.loggingOut.set(false);
    }
  }
}
