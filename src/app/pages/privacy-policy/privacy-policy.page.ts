import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The public privacy policy (App Store and Google Play both need a working public URL).
 * It describes what the apps really do: keep it in step with the code when data handling changes.
 */
@Component({
  selector: 'app-privacy-policy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="policy">
      <h1>Privacy Policy</h1>
      <p class="muted">Stitch&amp;Ship · Last updated 30 October 2026</p>

      <p>
        Stitch&amp;Ship is a stitching service: customers send fabric or place orders, our partner workshops make the garments, and we
        ship them. This policy explains what personal information the Stitch&amp;Ship customer app, the Stitch&amp;Ship staff app (S&amp;S Admin)
        and the website collect, why, and what you can do about it.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address, phone number and country, city, address and postal code, and your password (stored only in hashed form by our authentication provider). If you sign in with Google or Apple we receive your name and email from them. Apple may give us a private relay email address if you choose to hide your email.</li>
        <li><strong>Orders:</strong> the articles you order, your saved measurements and size charts, notes, delivery details, invoices and shipment tracking.</li>
        <li><strong>Photos, videos and voice notes</strong> that you or our staff attach to an order, a problem report or a chat message. The camera, photo library and microphone are used only when you choose to attach something; you can deny these permissions and still use the rest of the app.</li>
        <li><strong>Messages:</strong> support chat and order messages you send us.</li>
        <li><strong>Payments:</strong> card payments are handled by our payment providers (Stripe, and PayFast for deliveries inside Pakistan). We never see or store your full card number.</li>
        <li><strong>Device information:</strong> if you allow notifications, a push token that identifies your phone, and the platform (Android, iPhone or web) so we can send order updates.</li>
      </ul>

      <h2>How we use it</h2>
      <p>To create and secure your account, process and deliver your orders, take payment, show order progress, send notifications you allow, answer support requests, and meet our legal and tax duties. We do not sell your information.</p>

      <h2>Tracking and advertising</h2>
      <p>The apps contain no advertising and no third-party tracking, and we do not use the advertising identifier.</p>

      <h2>Who we share it with</h2>
      <p>Only the services needed to run Stitch&amp;Ship, each under its own privacy terms:</p>
      <ul>
        <li>Hosting, database and file storage (Supabase).</li>
        <li>Push notification delivery (Google Firebase Cloud Messaging, and Apple's notification service on iPhone).</li>
        <li>Sign-in (Google and Apple), when you choose those options.</li>
        <li>Payments (Stripe, PayFast).</li>
        <li>Couriers and our partner workshops, who receive the delivery name, address, phone number and order details needed to make and deliver your order.</li>
        <li>Email delivery for order and account emails.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>We keep your account while it is open. Finished orders and their invoices and payments are business and tax records, so they are kept after you delete your account, without your personal details attached to your profile.</p>

      <h2>Deleting your account</h2>
      <p>
        You can delete your account yourself in the customer app: <strong>Profile → Delete account</strong>. This removes your login,
        profile details, saved measurements, notifications, push devices, support chat and draft orders. An account cannot be deleted while an order
        is still in progress; you can delete it once the order is delivered or cancelled. Staff and partner accounts are managed by the platform administrator.
      </p>

      <h2>Your choices</h2>
      <p>You can update your details in <strong>Profile</strong>, switch notifications or any permission off in your phone's settings, and ask us for a copy or correction of your information.</p>

      <h2>Security</h2>
      <p>Data is sent over encrypted connections, access to staff features is limited by role, and sign-in sessions can be ended by logging out.</p>

      <h2>Children</h2>
      <p>Stitch&amp;Ship is not directed to children under 13 and we do not knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>If we change this policy we will update the date above and, for important changes, tell you in the app.</p>

      <h2>Contact</h2>
      <p>Write to us through <strong>Support chat</strong> in the app, or through the contact details on <a href="https://www.stitchnship.com">stitchnship.com</a>.</p>
    </main>
  `,
  styles: [
    `
      :host { display: block; background: #f8f9fa; min-height: 100vh; }
      .policy { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; color: #111827; font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
      h1 { font-size: 32px; margin: 0 0 4px; }
      h2 { font-size: 20px; margin: 28px 0 8px; }
      .muted { color: #6b7280; margin: 0 0 20px; }
      ul { padding-left: 20px; }
      li { margin: 6px 0; }
      a { color: #62003e; }
    `,
  ],
})
export class PrivacyPolicyPage {}
