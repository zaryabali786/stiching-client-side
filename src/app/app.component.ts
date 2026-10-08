import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IonApp } from '@ionic/angular';
import { ToastHostComponent } from './shared/toast-host.component';
import { NotificationService } from './core/services/notification.service';
import { ConfigService } from './core/services/config.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrl: 'app.component.scss',
  imports: [IonApp, RouterOutlet, ToastHostComponent],
})
export class AppComponent {
  // Instantiated at startup so unread-count polling follows the auth state.
  private readonly notifications = inject(NotificationService);
  // Fetch the admin's colours and fonts as soon as the app opens (also on the login pages).
  private readonly theme = inject(ThemeService);
  private readonly config = inject(ConfigService);

  constructor() {
    this.config.load();
  }
}
