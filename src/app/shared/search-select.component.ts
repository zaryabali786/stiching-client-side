import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { PageFetch, SearchPager } from '../core/utils/search-pager';
import { InfiniteScrollDirective } from './infinite-scroll.directive';
import { SheetComponent } from './sheet.component';

let nextId = 0;

/**
 * Accessible async combobox: server-side search (300 ms debounce) and paging, an eye button that previews an option's picture (only when it has one), optional
 * "add new" row. Opens as a bottom sheet on phones and an anchored dropdown on wider screens.
 * The trigger is a button (`aria-haspopup="listbox"`); the search field inside the panel is the
 * ARIA combobox that owns the listbox and `aria-activedescendant`.
 */
@Component({
  selector: 'app-search-select',
  imports: [NgTemplateOutlet, IonIcon, IonSpinner, SheetComponent, InfiniteScrollDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ss">
      <label class="ss-label" [id]="labelId" [for]="triggerId">
        {{ label() }}
        @if (required()) {
          <span class="req">required</span>
        } @else if (optionalTag()) {
          <span class="opt">optional</span>
        }
      </label>

      <div class="ss-control" [class.open]="open()" [class.disabled]="disabled()" [class.invalid]="invalid()">
        <button
          #trigger
          type="button"
          class="ss-trigger"
          [id]="triggerId"
          aria-haspopup="listbox"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="open() ? listId : null"
          [attr.aria-labelledby]="labelId + ' ' + valueId"
          [attr.aria-invalid]="invalid() ? 'true' : null"
          [attr.aria-describedby]="describedBy()"
          [attr.aria-required]="required() ? 'true' : null"
          [disabled]="disabled() || busy()"
          (click)="toggle()"
          (keydown)="onTriggerKey($event)"
        >
          @if (busy()) {
            <ion-spinner name="crescent" class="ss-spin"></ion-spinner>
            <span class="ss-value placeholder" [id]="valueId">{{ busyText() }}</span>
          } @else if (value(); as v) {
            @if (imageOf(v); as img) {
              <img class="ss-thumb" [src]="img" alt="" loading="lazy" referrerpolicy="no-referrer" (error)="$any($event.target).hidden = true" />
            }
            <span class="ss-value" [id]="valueId">
              <span class="ss-name">{{ labelOf(v) }}</span>
              @if (subtitleOf(v); as sub) {
                <span class="ss-sub">{{ sub }}</span>
              }
            </span>
          } @else {
            <span class="ss-value placeholder" [id]="valueId">{{ placeholder() }}</span>
          }
          <ion-icon class="ss-chev" [name]="open() ? 'chevron-up-outline' : 'chevron-down-outline'" aria-hidden="true"></ion-icon>
        </button>
        @if (value() && !disabled() && !busy()) {
          <button type="button" class="ss-clear" (click)="clear()" [attr.aria-label]="'Clear ' + label()">
            <ion-icon name="close-circle" aria-hidden="true"></ion-icon>
          </button>
        }

        @if (open() && !sheetMode()) {
          <div class="ss-pop" [class.up]="openUp()" (focusout)="onFocusOut($event)">
            <ng-container [ngTemplateOutlet]="panel" />
          </div>
        }
      </div>

      @if (hint() && !(invalid() && error())) {
        <span class="ss-hint" [id]="hintId">{{ hint() }}</span>
      }
      @if (invalid() && error()) {
        <span class="field-error" [id]="errId" role="alert">{{ error() }}</span>
      }
    </div>

    @if (open() && sheetMode()) {
      <app-sheet [open]="true" [title]="label()" (closed)="close(true)">
        <ng-container [ngTemplateOutlet]="panel" />
      </app-sheet>
    }

    @if (preview(); as p) {
      <div class="ss-lightbox" role="dialog" aria-modal="true" [attr.aria-label]="'Preview of ' + p.name" (click)="closePreview()" (keydown.tab)="$event.preventDefault()">
        <button #pvClose type="button" class="ss-lb-close" aria-label="Close preview" (click)="closePreview(); $event.stopPropagation()">
          <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
        </button>
        <figure class="ss-lb-fig" (click)="$event.stopPropagation()">
          @if (previewFailed()) {
            <p class="ss-lb-fail">This picture could not be loaded.</p>
          } @else {
            <img [src]="p.url" [alt]="p.name" referrerpolicy="no-referrer" (error)="previewFailed.set(true)" />
          }
          <figcaption>{{ p.name }}</figcaption>
        </figure>
      </div>
    }

    <ng-template #panel>
      <div class="ss-panel">
        <div class="input-affix leading ss-search">
          <ion-icon class="affix-icon" name="search-outline" aria-hidden="true"></ion-icon>
          <input
            #search
            class="input"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            [attr.aria-controls]="listId"
            [attr.aria-activedescendant]="activeId()"
            [attr.aria-label]="'Search ' + label()"
            [placeholder]="searchPlaceholder()"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            enterkeyhint="search"
            [value]="query()"
            (input)="onInput($event)"
            (keydown)="onSearchKey($event)"
          />
        </div>

        <div class="ss-scroll" [style.max-height.px]="sheetMode() ? sheetListMax() : null">
          @if (pager.loading()) {
            <div class="ss-skeleton" aria-hidden="true">
              @for (i of skeletonRows; track i) {
                <div class="ss-opt-sk">
                  <span class="skeleton" [style.width.%]="70 - i * 12" style="height: 13px"></span>
                </div>
              }
            </div>
          } @else if (pager.error()) {
            <div class="ss-msg err" role="alert">
              <ion-icon name="cloud-offline-outline" aria-hidden="true"></ion-icon>
              <span>{{ pager.error() }}</span>
              <button type="button" class="link-btn" tabindex="-1" (mousedown)="$event.preventDefault()" (click)="pager.retry()">Retry</button>
            </div>
          }

          @if (!pager.loading() && !pager.error() && pager.items().length === 0) {
            <p class="ss-msg">{{ trimmedQuery() ? 'No results for “' + trimmedQuery() + '”' : 'No results' }}</p>
          }

          <ul class="ss-list" role="listbox" [id]="listId" [attr.aria-label]="label()">
            @for (item of pager.items(); track item.id; let i = $index) {
              <li
                role="option"
                class="ss-opt"
                [id]="optId(i)"
                [class.active]="activeIndex() === i"
                [class.selected]="isSelected(item)"
                [attr.aria-selected]="isSelected(item)"
                (mousedown)="$event.preventDefault()"
                (mousemove)="activeIndex.set(i)"
                (click)="choose(item)"
              >
                <span class="ss-opt-text">
                  <span class="ss-name">{{ labelOf(item) }}</span>
                  @if (subtitleOf(item); as sub) {
                    <span class="ss-sub">{{ sub }}</span>
                  }
                </span>
                @if (isSelected(item)) {
                  <ion-icon name="checkmark-outline" class="ss-check" aria-hidden="true"></ion-icon>
                  <span class="sr-only">(selected)</span>
                }
                @if (imageOf(item); as img) {
                  <button
                    type="button"
                    class="ss-eye"
                    [attr.aria-label]="'Preview image of ' + labelOf(item)"
                    (click)="openPreview($event, img, labelOf(item))"
                  >
                    <ion-icon name="eye-outline" aria-hidden="true"></ion-icon>
                  </button>
                }
              </li>
            }
            @if (showCreate()) {
              <li
                role="option"
                class="ss-opt create"
                [id]="createId"
                [class.active]="activeIndex() === createIndex()"
                [attr.aria-selected]="false"
                (mousedown)="$event.preventDefault()"
                (mousemove)="activeIndex.set(createIndex())"
                (click)="doCreate()"
              >
                <span class="ss-thumb ph add" aria-hidden="true"><ion-icon name="add-outline"></ion-icon></span>
                <span class="ss-opt-text">
                  <span class="ss-name">Add “{{ trimmedQuery() }}” as {{ createLabel() }}</span>
                </span>
              </li>
            }
          </ul>

          @if (pager.loadingMore()) {
            <div class="ss-msg"><ion-spinner name="crescent"></ion-spinner> Loading more…</div>
          } @else if (pager.moreError()) {
            <div class="ss-msg err" role="alert">
              <span>Couldn't load more.</span>
              <button type="button" class="link-btn" tabindex="-1" (mousedown)="$event.preventDefault()" (click)="pager.retry()">Retry</button>
            </div>
          } @else if (pager.hasMore() && !pager.loading()) {
            <button type="button" class="link-btn ss-more" tabindex="-1" appInfiniteScroll (reached)="pager.loadMore()" (mousedown)="$event.preventDefault()" (click)="pager.loadMore()">
              Load more
            </button>
          }
        </div>
        <span class="sr-only" role="status" aria-live="polite">{{ statusText() }}</span>
      </div>
    </ng-template>
  `,
  styles: `
    :host { display: block; }
    .ss { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .ss-label { font-size: var(--fs-sm); font-weight: 600; color: var(--c-ink-2); }
    .req, .opt { margin-left: 4px; font-size: var(--fs-2xs); font-weight: 500; letter-spacing: 0.04em; color: var(--c-faint); }
    .req { color: var(--c-gold-dark); }
    .ss-hint { font-size: var(--fs-sm); line-height: 1.4; color: var(--c-faint); }

    .ss-control {
      position: relative; display: flex; align-items: center; min-height: 48px;
      border-radius: var(--radius-field); border: 1px solid var(--c-line-strong); background: var(--c-surface);
      transition: border-color 0.18s ease, box-shadow 0.18s ease;
    }
    .ss-control.open, .ss-control:focus-within { border-color: var(--c-focus); box-shadow: var(--focus-ring); }
    .ss-control.invalid { border-color: var(--t-red-fg); background: #fffbfa; }
    .ss-control.disabled { background: var(--c-surface-2); }
    .ss-trigger {
      flex: 1; min-width: 0; min-height: 46px; display: flex; align-items: center; gap: 10px;
      padding: 4px 12px 4px 14px; border: 0; border-radius: var(--radius-field); background: none;
      color: var(--c-ink); font-size: 16px; text-align: left; cursor: pointer;
    }
    .ss-trigger:focus-visible { outline: none; }
    .ss-trigger:disabled { cursor: not-allowed; color: var(--c-muted); }
    .ss-value { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
    .ss-value.placeholder { color: var(--c-placeholder); }
    .ss-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ss-sub { font-size: var(--fs-sm); color: var(--c-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ss-chev { flex: none; color: var(--c-muted); font-size: 16px; }
    .ss-spin { width: 18px; height: 18px; color: var(--c-brand); flex: none; }
    .ss-clear {
      flex: none; width: 44px; height: 44px; margin-right: 0; border: 0; border-radius: 50%; background: none;
      color: var(--c-muted); font-size: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer;
    }
    .ss-clear:hover { color: var(--c-ink); }

    .ss-thumb {
      flex: none; width: 36px; height: 36px; border-radius: 8px; object-fit: cover; background: var(--c-surface-3);
      display: flex; align-items: center; justify-content: center;
    }
    .ss-thumb.ph { color: var(--c-placeholder); font-size: 18px; }
    .ss-thumb.ph.add { background: var(--c-gold-tint); color: var(--c-gold-dark); }

    .ss-pop {
      position: absolute; z-index: 40; left: 0; right: 0; top: calc(100% + 6px);
      padding: 10px; border-radius: 16px; border: 1px solid var(--c-line-strong);
      background: var(--c-surface); box-shadow: var(--shadow-float);
    }
    .ss-pop.up { top: auto; bottom: calc(100% + 6px); }
    .ss-panel { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .ss-scroll { max-height: 280px; overflow-y: auto; overscroll-behavior: contain; margin: 0 -4px; padding: 0 4px; }
    .ss-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    .ss-opt {
      display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 6px 10px;
      border-radius: 12px; cursor: pointer; color: var(--c-ink); font-size: var(--fs-body);
    }
    .ss-opt-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .ss-opt.active { background: var(--c-brand-soft); box-shadow: inset 3px 0 0 var(--c-brand); }
    .ss-opt.selected { font-weight: 600; }
    .ss-opt.create { color: var(--c-gold-dark); font-weight: 600; border: 1px dashed var(--c-gold-line); margin-top: 4px; }
    .ss-opt.create.active { background: var(--c-gold-tint); box-shadow: inset 3px 0 0 var(--c-gold-dark); }
    .ss-check { flex: none; color: var(--c-brand); font-size: 18px; }
    .ss-skeleton { display: flex; flex-direction: column; gap: 2px; }
    .ss-opt-sk { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 6px 10px; }
    .ss-msg {
      display: flex; align-items: center; justify-content: center; gap: 8px; margin: 0; padding: 14px 10px;
      color: var(--c-muted); font-size: var(--fs-md); text-align: center;
    }
    .ss-msg.err { color: var(--t-red-fg); flex-wrap: wrap; }
    .ss-msg ion-spinner { width: 18px; height: 18px; color: var(--c-brand); }
    .ss-eye {
      flex: none; width: 40px; height: 40px; margin: -4px -6px -4px 0; border: 0; border-radius: 50%; background: none;
      color: var(--c-muted); font-size: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer;
    }
    .ss-eye:hover { background: var(--c-surface-3); color: var(--c-brand); }
    .ss-eye:focus-visible { outline: 2px solid var(--c-focus); outline-offset: -2px; }
    .ss-lightbox {
      position: fixed; inset: 0; z-index: 1500; display: flex; align-items: center; justify-content: center;
      padding: calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px));
      background: rgba(10, 14, 12, 0.92); animation: ss-lb-in 0.2s ease both;
    }
    @keyframes ss-lb-in { from { opacity: 0; } to { opacity: 1; } }
    .ss-lb-fig { margin: 0; max-width: 100%; max-height: 100%; display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .ss-lb-fig img { max-width: 100%; max-height: calc(100vh - 120px); border-radius: 12px; object-fit: contain; background: var(--c-surface-3); }
    .ss-lb-fig figcaption, .ss-lb-fail { margin: 0; color: #fff; font-size: var(--fs-md); text-align: center; overflow-wrap: anywhere; }
    .ss-lb-close {
      position: absolute; top: calc(12px + env(safe-area-inset-top, 0px)); right: 12px; width: 44px; height: 44px;
      border-radius: 50%; border: 0; background: rgba(255, 255, 255, 0.16); color: #fff; font-size: 22px;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
    }
    .ss-lb-close:focus-visible { outline: 3px solid var(--c-gold-light); outline-offset: 2px; }
    .ss-more { width: 100%; justify-content: center; min-height: 44px; align-self: center; }
  `,
})
export class SearchSelectComponent<T extends { id: string }> implements OnDestroy {
  readonly label = input.required<string>();
  readonly placeholder = input('Choose…');
  readonly searchPlaceholder = input('Type to search…');
  /** Selected item, or null. */
  readonly value = input<T | null>(null);
  readonly fetch = input.required<PageFetch<T>>();
  readonly itemLabel = input.required<(item: T) => string>();
  readonly itemImage = input<((item: T) => string | null | undefined) | null>(null);
  readonly itemSubtitle = input<((item: T) => string | null | undefined) | null>(null);
  readonly allowCreate = input(false);
  /** Noun used in the create row: Add “text” as {{ createLabel }}. */
  readonly createLabel = input('new item');
  readonly required = input(false);
  readonly optionalTag = input(false);
  readonly invalid = input(false);
  readonly error = input('');
  readonly hint = input('');
  readonly disabled = input(false);
  /** Shows a spinner in the field (e.g. while a new brand is being saved). */
  readonly busy = input(false);
  readonly busyText = input('Saving…');

  readonly selected = output<T>();
  readonly cleared = output<void>();
  readonly create = output<string>();
  /** The panel was closed (use it to show validation after the first visit). */
  readonly touched = output<void>();

  private uid = ++nextId;
  protected readonly triggerId = `ss-trigger-${this.uid}`;
  protected readonly labelId = `ss-label-${this.uid}`;
  protected readonly valueId = `ss-value-${this.uid}`;
  protected readonly listId = `ss-list-${this.uid}`;
  protected readonly createId = `ss-create-${this.uid}`;
  protected readonly errId = `ss-err-${this.uid}`;
  protected readonly hintId = `ss-hint-${this.uid}`;
  protected readonly skeletonRows = [0, 1, 2];

  protected readonly pager = new SearchPager<T>(() => this.fetch());
  protected readonly open = signal(false);
  protected readonly sheetMode = signal(false);
  protected readonly openUp = signal(false);
  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);
  /** Larger picture of an option (eye button); opening it never selects the option. */
  protected readonly preview = signal<{ url: string; name: string } | null>(null);
  protected readonly previewFailed = signal(false);
  /** Visible height (shrinks when the keyboard is up) so the sheet's list always fits. */
  private viewportH = signal(typeof window !== 'undefined' ? (window.visualViewport?.height ?? window.innerHeight) : 800);
  protected sheetListMax = computed(() => Math.max(120, Math.min(380, this.viewportH() - 250)));
  private vvListener = () => this.viewportH.set(window.visualViewport?.height ?? window.innerHeight);

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private searchEl = viewChild<ElementRef<HTMLInputElement>>('search');
  private pvClose = viewChild<ElementRef<HTMLButtonElement>>('pvClose');
  private previewFrom: HTMLElement | null = null;
  private typed$ = new Subject<string>();
  private typedSub: Subscription;

  protected trimmedQuery = computed(() => this.query().trim());

  /** Offer "Add new" when something is typed, its results are in, and nothing matches exactly. */
  protected showCreate = computed(() => {
    const q = this.trimmedQuery();
    if (!this.allowCreate() || !q || this.pager.loading() || this.pager.error()) return false;
    if (this.pager.appliedSearch() !== q) return false;
    const label = this.itemLabel();
    return !this.pager.items().some((i) => label(i).trim().toLowerCase() === q.toLowerCase());
  });

  private optionCount = computed(() => this.pager.items().length + (this.showCreate() ? 1 : 0));
  protected createIndex = computed(() => this.pager.items().length);
  private active = computed(() => Math.min(this.activeIndex(), this.optionCount() - 1));

  protected activeId = computed(() => {
    const i = this.active();
    if (i < 0) return null;
    return i === this.createIndex() && this.showCreate() ? this.createId : this.optId(i);
  });

  protected describedBy = computed(() => {
    if (this.invalid() && this.error()) return this.errId;
    return this.hint() ? this.hintId : null;
  });

  protected statusText = computed(() => {
    if (this.pager.loading()) return 'Loading results';
    if (this.pager.error()) return 'Results could not be loaded';
    const n = this.pager.items().length;
    return n === 0 ? 'No results' : `${n} result${n === 1 ? '' : 's'}${this.pager.hasMore() ? ', more available' : ''}`;
  });

  constructor() {
    this.typedSub = this.typed$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((q) => {
      if (!this.open()) return;
      this.activeIndex.set(0);
      this.pager.reset(q);
    });
    // Move focus to the close button when the preview opens.
    effect(() => {
      const btn = this.pvClose()?.nativeElement;
      if (btn) untracked(() => btn.focus({ preventScroll: true }));
    });
    // Esc closes only the preview (capture phase, so the dropdown / sheet underneath stays open).
    window.addEventListener('keydown', this.onPreviewKey, true);
    // Keep the highlighted option in view while moving with the keyboard.
    effect(() => {
      const id = this.activeId();
      if (!id) return;
      untracked(() => setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'nearest' })));
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.onPreviewKey, true);
    window.visualViewport?.removeEventListener('resize', this.vvListener);
    this.typedSub.unsubscribe();
    this.pager.destroy();
  }

  /** Move focus to the field (used to jump to the first invalid control). */
  focus(): void {
    this.trigger()?.nativeElement.focus();
  }

  protected labelOf(item: T): string {
    return this.itemLabel()(item);
  }
  protected imageOf(item: T): string | null {
    return this.itemImage()?.(item) || null;
  }
  protected subtitleOf(item: T): string | null {
    return this.itemSubtitle()?.(item) || null;
  }
  protected optId(i: number): string {
    return `ss-opt-${this.uid}-${i}`;
  }
  protected isSelected(item: T): boolean {
    return this.value()?.id === item.id;
  }

  // ───────── open / close ─────────

  protected toggle(): void {
    if (this.open()) this.close(true);
    else this.openPanel();
  }

  private openPanel(initial = ''): void {
    if (this.disabled() || this.busy()) return;
    const wide = typeof matchMedia === 'function' && matchMedia('(min-width: 640px)').matches;
    this.sheetMode.set(!wide);
    if (wide) {
      const rect = this.host.nativeElement.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom;
      this.openUp.set(below < 360 && rect.top > below);
    }
    this.query.set(initial);
    this.activeIndex.set(0);
    this.open.set(true);
    if (!wide) {
      this.vvListener();
      window.visualViewport?.addEventListener('resize', this.vvListener);
    }
    this.pager.reset(initial.trim());
    // The sheet moves focus to itself first; take it back for the search field afterwards.
    setTimeout(() => this.searchEl()?.nativeElement.focus(), this.sheetMode() ? 80 : 0);
  }

  protected close(refocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    window.visualViewport?.removeEventListener('resize', this.vvListener);
    this.touched.emit();
    if (refocus) setTimeout(() => this.trigger()?.nativeElement.focus({ preventScroll: true }));
  }

  /** Tab leaving the dropdown (the eye buttons are tab stops inside it) closes it. */
  protected onFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget as Node | null;
    if (this.open() && !this.sheetMode() && next && !this.host.nativeElement.contains(next)) this.close(false);
  }

  @HostListener('document:mousedown', ['$event'])
  onOutside(event: MouseEvent): void {
    if (this.open() && !this.sheetMode() && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  // ───────── image preview ─────────

  private onPreviewKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !this.preview()) return;
    e.preventDefault();
    e.stopPropagation();
    this.closePreview();
  };

  protected openPreview(event: Event, url: string, name: string): void {
    event.stopPropagation(); // the eye never selects the option
    this.previewFrom = event.currentTarget as HTMLElement | null;
    this.previewFailed.set(false);
    this.preview.set({ url, name });
  }

  protected closePreview(): void {
    if (!this.preview()) return;
    this.preview.set(null);
    const back = this.previewFrom?.isConnected ? this.previewFrom : (this.searchEl()?.nativeElement ?? this.trigger()?.nativeElement);
    this.previewFrom = null;
    setTimeout(() => back?.focus({ preventScroll: true }));
  }

  // ───────── choose ─────────

  protected choose(item: T): void {
    this.selected.emit(item);
    this.close(true);
  }

  protected doCreate(): void {
    const text = this.trimmedQuery();
    if (!text) return;
    this.create.emit(text);
    this.close(true);
  }

  protected clear(): void {
    this.cleared.emit();
    this.trigger()?.nativeElement.focus();
  }

  // ───────── keyboard ─────────

  protected onTriggerKey(e: KeyboardEvent): void {
    if (this.disabled()) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this.open()) this.openPanel();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
      // Type-ahead: start searching with the typed character.
      e.preventDefault();
      if (!this.open()) this.openPanel(e.key);
    }
  }

  protected onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.query.set(text);
    this.typed$.next(text.trim());
  }

  protected onSearchKey(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.move(-1);
        break;
      case 'Home':
      case 'End':
        // With text in the field Home/End keep moving the caret.
        if (!this.query()) {
          e.preventDefault();
          this.activeIndex.set(e.key === 'Home' ? 0 : Math.max(0, this.optionCount() - 1));
        }
        break;
      case 'Enter':
        e.preventDefault();
        this.activate();
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
        break;
    }
  }

  private move(delta: number): void {
    const count = this.optionCount();
    if (!count) return;
    const next = this.active() + delta;
    if (next >= count) {
      this.pager.loadMore();
      this.activeIndex.set(count - 1);
    } else this.activeIndex.set(Math.max(0, next));
  }

  private activate(): void {
    // Ignore Enter while the list still belongs to an older search.
    if (this.pager.loading() || this.pager.appliedSearch() !== this.trimmedQuery()) return;
    const i = this.active();
    if (i < 0) return;
    const items = this.pager.items();
    if (i < items.length) this.choose(items[i]);
    else if (this.showCreate()) this.doCreate();
  }
}
