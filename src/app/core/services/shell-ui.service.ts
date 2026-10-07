import { Injectable, signal } from '@angular/core';

/**
 * Lets a page tell the app shell how to look. A page with its own sticky action bar (Pay, Approve,
 * Edit order) hides the bottom tab bar so the two bars never stack and the action bar sits at the bottom.
 */
@Injectable({ providedIn: 'root' })
export class ShellUiService {
  readonly hideTabbar = signal(false);
}
