import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IonApp } from '@ionic/angular';
import { ToastHostComponent } from './shared/toast-host.component';
import { NotificationService } from './core/services/notification.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrl: 'app.component.scss',
  imports: [IonApp, RouterOutlet, ToastHostComponent],
})
export class AppComponent {
  // Instantiated at startup so unread-count polling follows the auth state.
  private readonly notifications = inject(NotificationService);
}
