import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { HomeSection } from '../core/services/home-layout.service';
import { HomeBannersComponent } from './home-banners.component';
import { AutoScrollDirective } from './auto-scroll.directive';

/**
 * Renders the home page sections the admin arranged in Setup > Home layout, in order.
 * Every section type has its own look; colours and text come from the section's settings.
 */
@Component({
  selector: 'app-home-sections',
  imports: [NgTemplateOutlet, IonIcon, HomeBannersComponent, AutoScrollDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-sections.component.html',
  styleUrl: './home-sections.component.scss',
})
export class HomeSectionsComponent {
  private router = inject(Router);

  sections = input<HomeSection[]>([]);
  private dismissed = signal<string[]>(readDismissed());

  isDismissed(id: string): boolean {
    return this.dismissed().includes(id);
  }

  dismiss(id: string): void {
    const next = [...this.dismissed(), id];
    this.dismissed.set(next);
    try {
      sessionStorage.setItem('dismissed-announcements', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  /** In-app links (/app/...) use the router; anything else opens in a new tab. */
  href(link: string): string | null {
    return link || null;
  }

  go(event: Event, link: string): void {
    if (link.startsWith('/app/')) {
      event.preventDefault();
      void this.router.navigateByUrl(link);
    }
  }

  external(link: string): boolean {
    return !!link && !link.startsWith('/app/');
  }

  initial(name: string): string {
    return (name || '?').trim().charAt(0).toUpperCase();
  }

  marqueeSeconds(speed: string): number {
    return speed === 'fast' ? 12 : speed === 'slow' ? 36 : 22;
  }
}

function readDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem('dismissed-announcements') || '[]');
  } catch {
    return [];
  }
}
