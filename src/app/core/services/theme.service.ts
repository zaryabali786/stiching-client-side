import { Injectable, signal } from '@angular/core';

/** Look of the app chosen by the admin (Setup > Appearance); delivered inside GET /config. */
export interface ClientTheme {
  primary: string;
  primary_2: string;
  primary_text: string;
  /** Colour of the soft surfaces (draft order, order details, profile, inbox). Falls back to the main colour. */
  accent?: string;
  badge_bg: string;
  badge_bg_2: string;
  badge_text: string;
  notification_bg: string;
  notification_bg_2: string;
  notification_text: string;
  body_font: string;
  heading_font: string;
  font_size: number;
  /** Page title size in px (default 32); other headings scale with it. */
  heading_size?: number;
  /** 'solid' = filled buttons, 'outline' = outlined with a faded fill. */
  button_style?: 'solid' | 'outline' | 'fade';
}

const CACHE_KEY = 'client-theme';
const FONT_LINK_ID = 'theme-fonts';

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
/** Blend `hex` towards `target` by `amount` (0 = hex, 1 = target). */
const mix = (hex: string, target: string, amount: number) => {
  const a = rgb(hex);
  const b = rgb(target);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount));
};

/** Applies the admin's theme as CSS variables on <html>. The last theme is cached so the app never flashes the defaults. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** True when the admin chose the "Outline & Fade" button style: selected icons stay outlined, with a faded fill. */
  readonly outline = signal(false);

  constructor() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) this.apply(JSON.parse(cached) as ClientTheme, false);
    } catch {
      /* storage unavailable: the defaults in global.scss apply */
    }
  }

  apply(theme: ClientTheme | null | undefined, cache = true): void {
    if (!theme || typeof document === 'undefined') return;
    const root = document.documentElement.style;
    const set = (name: string, value: string) => root.setProperty(name, value);

    const p = theme.primary;
    const [r, g, b] = rgb(p);
    set('--c-brand', p);
    const p2 = theme.primary_2 || p;
    set('--c-brand-2', p2);
    set('--c-brand-fill', `linear-gradient(135deg, ${p} 0%, ${p2} 100%)`);
    set('--c-brand-light', mix(p, '#ffffff', 0.28));
    set('--c-brand-soft', mix(p, '#ffffff', 0.92));
    set('--c-brand-glow', `rgba(${r}, ${g}, ${b}, 0.16)`);
    set('--c-on-brand', theme.primary_text || '#ffffff');
    set('--c-brand-faded', `rgba(${r}, ${g}, ${b}, 0.12)`);
    set('--c-brand-faded-hover', `rgba(${r}, ${g}, ${b}, 0.2)`);
    set('--c-brand-ring', `rgba(${r}, ${g}, ${b}, 0.55)`);
    const style = theme.button_style === 'outline' || theme.button_style === 'fade' ? theme.button_style : 'solid';
    this.outline.set(style !== 'solid');
    document.documentElement.dataset['buttonStyle'] = style;
    const ac = /^#[0-9a-fA-F]{6}$/.test(theme.accent ?? '') ? theme.accent! : p;
    const [ar, ag, ab] = rgb(ac);
    const lum = (0.299 * ar + 0.587 * ag + 0.114 * ab) / 255;
    set('--c-accent', ac);
    set('--c-accent-faded', `rgba(${ar}, ${ag}, ${ab}, 0.12)`);
    set('--c-accent-ring', `rgba(${ar}, ${ag}, ${ab}, 0.45)`);
    set('--c-accent-glow', `rgba(${ar}, ${ag}, ${ab}, 0.18)`);
    set('--c-accent-fill', `linear-gradient(135deg, ${ac} 0%, ${mix(ac, '#ffffff', 0.25)} 100%)`);
    set('--c-on-accent', lum > 0.62 ? '#111827' : '#ffffff');
    set('--c-focus', p);
    set('--focus-ring', `0 0 0 3px rgba(${r}, ${g}, ${b}, 0.18)`);
    set('--ion-color-primary', p);
    set('--ion-color-primary-rgb', `${r}, ${g}, ${b}`);
    set('--ion-color-primary-shade', mix(p, '#000000', 0.12));
    set('--ion-color-primary-tint', mix(p, '#ffffff', 0.15));

    set('--badge-bg', theme.badge_bg);
    set('--badge-fill', `linear-gradient(135deg, ${theme.badge_bg} 0%, ${theme.badge_bg_2 || theme.badge_bg} 100%)`);
    set('--badge-text', theme.badge_text);
    set('--notif-bg', theme.notification_bg);
    set('--notif-fill', `linear-gradient(135deg, ${theme.notification_bg} 0%, ${theme.notification_bg_2 || theme.notification_bg} 100%)`);
    set('--notif-text', theme.notification_text);
    set('--notif-unread-bg', mix(theme.notification_bg, '#ffffff', 0.9));

    const sans = `'${theme.body_font}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
    set('--font-sans', sans);
    set('--font-serif', `'${theme.heading_font}', Georgia, 'Times New Roman', serif`);
    // every text size follows the body size (default 15px)
    const s = theme.font_size;
    set('--heading-scale', String((theme.heading_size || 32) / 32));
    set('--fs-2xs', `${s - 4}px`);
    set('--fs-xs', `${s - 3}px`);
    set('--fs-sm', `${s - 2}px`);
    set('--fs-md', `${s - 1}px`);
    set('--fs-body', `${s}px`);
    set('--fs-lg', `${s + 2}px`);

    this.loadFonts([theme.body_font, theme.heading_font]);
    if (cache) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(theme));
      } catch {
        /* ignore */
      }
    }
  }

  private loadFonts(families: string[]): void {
    const unique = [...new Set(families)];
    const href = `https://fonts.googleapis.com/css2?${unique.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700`).join('&')}&display=swap`;
    let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = FONT_LINK_ID;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }
}
