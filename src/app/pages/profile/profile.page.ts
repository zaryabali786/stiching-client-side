import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MailboxService } from '../../core/services/mailbox.service';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { AppleSignInCancelled, GoogleSignInCancelled, isIosApp, isNativeApp, nativeAppleIdToken, nativeGoogleIdToken } from '../../core/services/native-oauth';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/services/api.service';
import { copyText } from '../../core/utils/image';
import { ShipToCardComponent } from '../../shared/ship-to-card.component';
import { GeoPickerComponent } from '../../shared/geo-picker.component';
import { passwordStrength } from '../auth/register/register.data';

@Component({
  selector: 'app-profile',
  imports: [DatePipe, RouterLink, FormsModule, IonIcon, IonSpinner, ShipToCardComponent, GeoPickerComponent],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  protected auth = inject(AuthService);
  private toast = inject(ToastService);
  protected mailbox = inject(MailboxService);
  private config = inject(ConfigService);

  user = this.auth.user;
  initial = computed(() => (this.user()?.full_name || this.user()?.email || '?').charAt(0).toUpperCase());

  // Edit profile
  editing = signal(false);
  saving = signal(false);
  profileError = signal<string | null>(null);
  fullName = signal('');
  phone = signal('');
  country = signal('');
  /** Only used to choose the city (found again from the saved city when the form opens). */
  state = signal('');
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
  protected readonly privacyUrl = environment.privacyPolicyUrl;

  // Delete account (App Store rule: an app that creates accounts must let the customer delete them inside the app)
  delOpen = signal(false);
  delPassword = signal('');
  delConfirm = signal('');
  delBusy = signal(false);
  delError = signal<string | null>(null);
  /** Apple and Google confirmation exist for people who signed up with them and have no password of their own. */
  readonly nativeApp = isNativeApp();
  readonly iosApp = isIosApp();
  readonly delConfirmed = computed(() => this.delConfirm().trim().toUpperCase() === 'DELETE');

  openDelete(): void {
    this.delPassword.set('');
    this.delConfirm.set('');
    this.delError.set(null);
    this.delOpen.set(true);
  }

  async deleteWithPassword(): Promise<void> {
    if (!this.delPassword()) {
      this.delError.set('Enter your password, or confirm with Apple or Google below.');
      return;
    }
    await this.runDelete({ password: this.delPassword() });
  }

  async deleteWithApple(): Promise<void> {
    if (!this.delConfirmed() || this.delBusy()) return;
    try {
      const { idToken, name } = await nativeAppleIdToken();
      await this.runDelete({ idToken, provider: 'apple', name });
    } catch (err) {
      if (!(err instanceof AppleSignInCancelled)) this.delError.set(errorMessage(err));
    }
  }

  async deleteWithGoogle(): Promise<void> {
    if (!this.delConfirmed() || this.delBusy()) return;
    const clientId = this.config.config()?.google?.clientId;
    if (!clientId) {
      this.delError.set('Google confirmation is not available right now.');
      return;
    }
    try {
      const idToken = await nativeGoogleIdToken(clientId, this.config.config()?.google?.iosClientId);
      await this.runDelete({ idToken, provider: 'google' });
    } catch (err) {
      if (!(err instanceof GoogleSignInCancelled)) this.delError.set(errorMessage(err));
    }
  }

  private async runDelete(proof: { password?: string; idToken?: string; provider?: 'apple' | 'google'; name?: string }): Promise<void> {
    if (!this.delConfirmed()) {
      this.delError.set('Type DELETE to confirm.');
      return;
    }
    this.delBusy.set(true);
    this.delError.set(null);
    try {
      await this.auth.deleteAccount(proof);
      this.toast.success('Your account has been deleted.');
    } catch (err) {
      this.delError.set(errorMessage(err));
    } finally {
      this.delBusy.set(false);
    }
  }

  startEdit(): void {
    const u = this.user();
    if (!u) return;
    this.fullName.set(u.full_name ?? '');
    this.phone.set(u.phone ?? '');
    this.country.set(u.country ?? '');
    this.state.set('');
    this.city.set(u.city ?? '');
    this.address.set(u.address ?? '');
    this.postalCode.set(u.postal_code ?? '');
    this.profileError.set(null);
    this.editing.set(true);
  }

  async saveProfile(): Promise<void> {
    const country = this.country().trim();
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
  codeCopied = signal(false);

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
    if (await copyText(code)) {
      this.toast.success('Customer code copied — write it on your parcel.');
      this.codeCopied.set(true);
      setTimeout(() => this.codeCopied.set(false), 2000);
    } else {
      this.toast.error('Could not copy — your code is ' + code + '.');
    }
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
