import { Pipe, PipeTransform } from '@angular/core';

/** "just now", "5 min ago", "3 h ago", "2 d ago", else "12 Sep 2026". */
@Pipe({ name: 'timeAgo' })
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    const t = date.getTime();
    if (Number.isNaN(t)) return '';
    const diff = Math.max(0, Date.now() - t) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    if (diff < 86400 * 7) {
      const d = Math.floor(diff / 86400);
      return d === 1 ? 'yesterday' : `${d} days ago`;
    }
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
