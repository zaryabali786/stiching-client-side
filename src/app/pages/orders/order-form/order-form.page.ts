import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { Subscription, firstValueFrom } from 'rxjs';
import { OrderService } from '../../../core/services/order.service';
import { SizeService } from '../../../core/services/size.service';
import { ToastService } from '../../../core/services/toast.service';
import { CatalogService } from '../../../core/services/catalog.service';
import { ChatService } from '../../../core/services/chat.service';
import { MailboxService } from '../../../core/services/mailbox.service';
import { errorMessage } from '../../../core/services/api.service';
import { Article, ArticleType, Brand, Courier, OrderDetail, OrderInput, SizeChart, UnitInput, VoiceNote } from '../../../core/models/api.models';
import { isStoredVoice, voiceField } from '../../../core/utils/voice-note';
import { ImageUpload, compressImage } from '../../../core/utils/image';
import { PageFetch } from '../../../core/utils/search-pager';
import { ShipToCardComponent } from '../../../shared/ship-to-card.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../../shared/ui-states';
import { SearchSelectComponent } from '../../../shared/search-select.component';
import { SizeSummaryComponent } from '../../../shared/size-summary.component';
import { VoicePlayerComponent } from '../../../shared/voice-player.component';
import { VoiceRecording } from '../../../shared/voice-recorder.component';
import { VoiceNoteFieldComponent } from '../../../shared/voice-note-field.component';
import { SizeChartFormComponent } from '../../sizes/components/size-chart-form/size-chart-form.component';


const MAX_PHOTOS = 4;
const MAX_ARTICLES = 30;
const DRAFT_KEY = 'stx_order_draft_v1';

type Step = 1 | 2 | 3;
type FieldKey = 'brand' | 'courier' | 'tracking' | 'international';

interface ArticleDraft {
  key: number;
  /** Set when editing an existing article, so the backend updates it in place. */
  id?: string;
  /** Reference photos already saved on the server (kept unless removed). */
  existingImages: NonNullable<OrderDetail['units'][number]['reference_images']>;
  open: boolean;
  product_link: string;
  unit_title: string;
  /** True while the name came from "Fetch details" (so a new fetch may replace it). */
  titleFromLink: boolean;
  product_image_url: string;
  preview: { state: 'idle' | 'loading' | 'ok' | 'failed'; message: string | null };
  size_chart_id: string;
  /** Chosen customisation per article type id (at most one each). */
  picks: Record<string, Article>;
  notes: string;
  /** Voice note next to the written note: undefined = none/unchanged, null = removed, with `path` = new upload. */
  notes_audio: VoiceNote | null | undefined;
  /** The order already had a saved voice note (so removing it must be sent as null). */
  audioHad: boolean;
  quantity: number;
  photos: ImageUpload[];
  processing: boolean;
}

type SavedArticle = Omit<ArticleDraft, 'photos' | 'processing' | 'existingImages' | 'preview'>;

interface SavedDraft {
  v: 1;
  step: Step;
  brand: Brand | null;
  brandOrderNumber: string;
  courier: Courier | null;
  tracking: string;
  international: boolean | null;
  note: string;
  typeNames: Record<string, string>;
  articles: SavedArticle[];
}

const articleLabel = (a: Article): string => a.name;
const articleImage = (a: Article): string | null => a.image_url;
const brandLabel = (b: Brand): string => b.name;
const courierLabel = (c: Courier): string => c.name;
const courierSub = (c: Courier): string | null => (c.requires_tracking ? 'Tracking number needed' : null);

@Component({
  selector: 'app-order-form',
  imports: [
    FormsModule,
    RouterLink,
    IonIcon,
    IonSpinner,
    ShipToCardComponent,
    SkeletonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SearchSelectComponent,
    VoicePlayerComponent,
    VoiceNoteFieldComponent,
    SizeChartFormComponent,
    SizeSummaryComponent,
  ],
  templateUrl: './order-form.page.html',
  styleUrl: './order-form.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderFormPage {
  private orders = inject(OrderService);
  private sizes = inject(SizeService);
  private catalog = inject(CatalogService);
  private chat = inject(ChatService);
  private mailbox = inject(MailboxService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  /** Route param (edit mode) — bound by withComponentInputBinding. */
  readonly id = input<string>();
  readonly isEdit = computed(() => !!this.id());
  /** Editing a draft made from an email: saving submits it. */
  isDraft = signal(false);
  /** `?import=<id>`: a draft read from an email (Inbox) to prefill this new order from. */
  readonly importId = input<string | undefined>(undefined, { alias: 'import' });
  /** The draft this order was prefilled from; sent with the order so the draft is marked used. */
  private fromImport: string | null = null;
  importing = signal(false);

  readonly maxPhotos = MAX_PHOTOS;
  readonly stepLabels = ['Order', 'Articles', 'Notes & review'];

  // Option helpers for <app-search-select>
  readonly fetchBrands: PageFetch<Brand> = (page, search) => this.catalog.brands(page, search);
  readonly fetchCouriers: PageFetch<Courier> = (page, search) => this.catalog.couriers(page, search);
  readonly brandLabel = brandLabel;
  readonly courierLabel = courierLabel;
  readonly courierSub = courierSub;
  readonly articleLabel = articleLabel;
  readonly articleImage = articleImage;
  private articleFetchers = new Map<string, PageFetch<Article>>();

  step = signal<Step>(1);
  stepTitle = computed(() => {
    switch (this.step()) {
      case 1:
        return this.isDraft() ? 'Complete your order' : this.isEdit() ? 'Update your order' : 'Order details';
      case 2:
        return 'Your articles';
      default:
        return 'Notes & review';
    }
  });
  /** Short line in the sticky footer telling the customer what comes next. */
  footerHint = computed(() => {
    switch (this.step()) {
      case 1:
        return 'Next: your articles';
      case 2: {
        const n = this.articles().length;
        return `${n} article${n === 1 ? '' : 's'} · ${this.totalPieces()} pc`;
      }
      default:
        return this.isDraft() ? 'Submit it to send it on' : this.isEdit() ? 'Save your changes' : 'Then ship your parcel';
    }
  });

  // ───────── Step 1 ─────────
  brand = signal<Brand | null>(null);
  brandOrderNumber = signal('');
  courier = signal<Courier | null>(null);
  trackingNumber = signal('');
  /** null until the customer chooses (no default on purpose). */
  international = signal<boolean | null>(null);
  creatingBrand = signal(false);
  touched = signal<ReadonlySet<FieldKey>>(new Set());

  trackingRequired = computed(() => !!this.courier()?.requires_tracking);
  shippingType = computed(() => {
    const v = this.international();
    return v === null ? null : v ? ('express' as const) : ('standard' as const);
  });

  step1Errors = computed(() => {
    const e: Partial<Record<FieldKey, string>> = {};
    if (!this.brand()) e.brand = 'Choose the brand you ordered from.';
    if (!this.courier()) e.courier = 'Choose the courier delivering your parcel.';
    else if (this.trackingRequired() && !this.trackingNumber().trim()) e.tracking = `Enter the tracking number for ${this.courier()!.name}.`;
    if (this.international() === null) e.international = 'Choose Yes or No.';
    return e;
  });
  step1Valid = computed(() => Object.keys(this.step1Errors()).length === 0);

  // ───────── Step 2 ─────────
  articles = signal<ArticleDraft[]>([]);
  private seq = 0;

  // Article types are fetched once per wizard session (first page on entering step 2, then "Load more").
  types = signal<ArticleType[]>([]);
  typesLoading = signal(false);
  typesLoadingMore = signal(false);
  typesError = signal<string | null>(null);
  typesHasMore = signal(false);
  private typesPage = 0;
  private typesLoaded = false;
  private typesSub?: Subscription;
  /** type id -> name, also filled from saved picks so chips have labels before the types load. */
  typeNames = signal<Record<string, string>>({});

  // Size charts
  charts = signal<SizeChart[]>([]);
  chartsLoading = signal(true);
  chartsError = signal<string | null>(null);
  sizeFormFor = signal<number | null>(null);
  people = computed(() => [...new Set(this.charts().map((c) => c.person_name))]);

  // ───────── Step 3 ─────────
  note = signal('');
  voice = signal<VoiceRecording | null>(null);
  recordingVoice = signal(false);
  /** Articles whose voice note is still uploading (Next / Submit wait for them). */
  private uploading = signal<ReadonlySet<number>>(new Set());
  anyUploading = computed(() => this.uploading().size > 0);

  // Edit mode
  loadingOrder = signal(false);
  loadError = signal<string | null>(null);
  notEditable = signal<OrderDetail | null>(null);

  submitting = signal(false);
  showErrors = signal(false);
  submitError = signal<string | null>(null);

  // Draft (new orders only)
  draftRestored = signal(false);
  confirmStartOver = signal(false);
  private draftEnabled = false;
  private saveTimer?: ReturnType<typeof setTimeout>;

  private brandSel = viewChild<SearchSelectComponent<Brand>>('brandSel');
  private courierSel = viewChild<SearchSelectComponent<Courier>>('courierSel');

  articleErrors = computed(() =>
    this.articles().map((a) => {
      const e: Record<string, string> = {};
      if (!a.unit_title.trim()) e['title'] = 'Enter the product name (e.g. "Embroidered lawn 3-pc").';
      if (a.product_link.trim() && !/^https?:\/\/\S+$/i.test(a.product_link.trim())) e['link'] = 'Paste a full link starting with https://';
      if (!(a.quantity >= 1 && a.quantity <= 20)) e['quantity'] = 'Quantity must be between 1 and 20.';
      return e;
    }),
  );

  step2Valid = computed(() => this.articles().length > 0 && this.articleErrors().every((e) => Object.keys(e).length === 0));
  totalPieces = computed(() => this.articles().reduce((sum, a) => sum + (a.quantity || 0), 0));

  private orderSub?: Subscription;
  private previewSubs = new Map<number, Subscription>();

  constructor() {
    this.loadCharts();

    effect(() => {
      const id = this.id();
      const imp = this.importId();
      untracked(() => {
        if (id) this.loadOrder(id);
        else {
          this.initCreate();
          if (imp) this.applyImport(imp);
        }
      });
    });

    // Load article types the first time step 2 opens.
    effect(() => {
      if (this.step() === 2) untracked(() => this.loadTypes());
    });

    // Keep a lightweight draft of the NEW order (no photos / voice) so a reload does not lose it.
    effect(() => {
      const snap = this.snapshot();
      untracked(() => this.scheduleSave(snap));
    });

    this.destroyRef.onDestroy(() => {
      clearTimeout(this.saveTimer);
      this.previewSubs.forEach((s) => s.unsubscribe());
    });
  }

  // ───────── draft ─────────

  private snapshot = computed<SavedDraft>(() => ({
    v: 1,
    step: this.step(),
    brand: this.brand(),
    brandOrderNumber: this.brandOrderNumber(),
    courier: this.courier(),
    tracking: this.trackingNumber(),
    international: this.international(),
    note: this.note(),
    typeNames: this.typeNames(),
    articles: this.articles().map(({ photos, processing, existingImages, preview, ...rest }) => {
      void photos;
      void processing;
      void existingImages;
      void preview;
      // Only the stored reference is kept in the draft, never audio bytes or the (expiring) link.
      const v = rest.notes_audio;
      return { ...rest, notes_audio: isStoredVoice(v) ? { path: v.path, mime: v.mime, size: v.size, duration: v.duration } : undefined };
    }),
  }));

  private scheduleSave(snap: SavedDraft): void {
    if (!this.draftEnabled) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(snap));
      } catch {
        /* storage unavailable – the draft just won't survive a reload */
      }
    }, 300);
  }

  private clearDraft(): void {
    this.draftEnabled = false;
    clearTimeout(this.saveTimer);
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  private readDraft(): SavedDraft | null {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      const d = raw ? (JSON.parse(raw) as SavedDraft) : null;
      return d && d.v === 1 && Array.isArray(d.articles) ? d : null;
    } catch {
      return null;
    }
  }

  private hasContent(d: SavedDraft): boolean {
    return !!(
      d.brand ||
      d.courier ||
      d.tracking.trim() ||
      d.brandOrderNumber.trim() ||
      d.note.trim() ||
      d.international !== null ||
      d.articles.some((a) => a.unit_title.trim() || a.product_link.trim() || Object.keys(a.picks).length || a.notes.trim())
    );
  }

  private initCreate(): void {
    this.resetForCreate();
    const draft = this.readDraft();
    if (draft && this.hasContent(draft)) {
      this.brand.set(draft.brand);
      this.brandOrderNumber.set(draft.brandOrderNumber);
      this.courier.set(draft.courier);
      this.trackingNumber.set(draft.tracking);
      this.international.set(draft.international);
      this.note.set(draft.note);
      this.typeNames.set(draft.typeNames ?? {});
      if (draft.articles.length) {
        this.articles.set(draft.articles.map((a) => ({ ...this.newArticle(), ...a, existingImages: [], photos: [], processing: false, preview: { state: 'idle', message: null } })));
        this.seq = Math.max(this.seq, ...draft.articles.map((a) => a.key));
      }
      this.step.set(draft.step ?? 1);
      this.draftRestored.set(true);
    }
    this.draftEnabled = true;
  }

  /** Fill the new order from a draft read out of an email: order number, tracking, brand and every product. */
  private applyImport(importId: string): void {
    this.importing.set(true);
    this.mailbox
      .importDraft(importId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (imp) => {
          this.importing.set(false);
          const x = imp.extracted;
          if (imp.status === 'used') {
            this.toast.info('An order was already created from this email.');
            return;
          }
          if (!x) {
            this.toast.info('We could not read this email — fill the order in by hand.');
            return;
          }
          this.fromImport = imp.id;
          this.clearDraft();
          this.resetForCreate();
          this.draftEnabled = true;
          if (x.order_number) this.brandOrderNumber.set(x.order_number);
          if (x.tracking_number) this.trackingNumber.set(x.tracking_number);
          if (x.items.length) {
            this.articles.set(
              x.items.slice(0, MAX_ARTICLES).map((it) => ({
                ...this.newArticle(),
                unit_title: (it.title || '').slice(0, 200),
                product_link: it.url && /^https?:\/\/\S+$/i.test(it.url) ? it.url : '',
                product_image_url: it.image_url && /^https?:\/\//i.test(it.image_url) ? it.image_url : '',
                quantity: Math.min(20, Math.max(1, Math.round(Number(it.quantity)) || 1)),
              })),
            );
          }
          if (x.brand) this.matchBrand(x.brand);
          this.toast.info('Filled in from your email — check the details, then choose your courier and sizes.');
        },
        error: (err: unknown) => {
          this.importing.set(false);
          this.toast.error(err);
        },
      });
  }

  /** Pick the catalogue brand that matches the name read from the email (exact name, or the only search result). */
  private matchBrand(name: string): void {
    this.catalog
      .brands(1, name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items }) => {
          const wanted = name.trim().toLowerCase();
          const hit = items.find((b) => b.name.trim().toLowerCase() === wanted) ?? (items.length === 1 ? items[0] : null);
          if (hit) this.brand.set(hit);
          else this.toast.info(`Choose the brand — the email is from "${name}".`);
        },
        error: () => undefined, // the customer simply picks the brand themselves
      });
  }

  /** Throw the draft away and begin a clean order. */
  startOver(): void {
    this.fromImport = null;
    this.clearDraft();
    this.resetForCreate();
    this.draftRestored.set(false);
    this.confirmStartOver.set(false);
    this.showErrors.set(false);
    this.touched.set(new Set());
    this.draftEnabled = true;
  }

  // ───────── loading ─────────

  loadCharts(): void {
    this.chartsLoading.set(true);
    this.chartsError.set(null);
    this.sizes
      .list({ limit: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items }) => {
          this.charts.set(items);
          this.chartsLoading.set(false);
        },
        error: (err: Error) => {
          this.chartsError.set(err.message);
          this.chartsLoading.set(false);
        },
      });
  }

  /** First page of article types (cached for the wizard session); later pages through "Load more". */
  loadTypes(more = false): void {
    if (!more && (this.typesLoaded || this.typesLoading())) return;
    if (more && (this.typesLoadingMore() || !this.typesHasMore())) return;
    const page = more ? this.typesPage + 1 : 1;
    (more ? this.typesLoadingMore : this.typesLoading).set(true);
    this.typesError.set(null);
    this.typesSub?.unsubscribe();
    this.typesSub = this.catalog.articleTypes(page).subscribe({
      next: ({ items, meta }) => {
        const seen = new Set(this.types().map((t) => t.id));
        this.types.update((list) => [...list, ...items.filter((t) => !seen.has(t.id))]);
        this.typeNames.update((m) => ({ ...m, ...Object.fromEntries(items.map((t) => [t.id, t.name])) }));
        this.typesPage = page;
        this.typesHasMore.set(!!meta.hasMore);
        this.typesLoaded = true;
        this.typesLoading.set(false);
        this.typesLoadingMore.set(false);
      },
      error: (err: Error) => {
        this.typesError.set(err.message);
        this.typesLoading.set(false);
        this.typesLoadingMore.set(false);
      },
    });
  }

  retryTypes(): void {
    this.typesError.set(null);
    this.loadTypes(this.typesLoaded);
  }

  loadOrder(id: string): void {
    this.orderSub?.unsubscribe();
    this.loadingOrder.set(true);
    this.loadError.set(null);
    this.notEditable.set(null);
    this.orderSub = this.orders
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => {
          this.loadingOrder.set(false);
          if (order.status !== 'submitted' && order.status !== 'draft') {
            this.notEditable.set(order);
            return;
          }
          this.isDraft.set(order.status === 'draft');
          this.prefill(order);
        },
        error: (err: Error) => {
          this.loadError.set(err.message);
          this.loadingOrder.set(false);
        },
      });
  }

  private resetForCreate(): void {
    this.step.set(1);
    this.brand.set(null);
    this.brandOrderNumber.set('');
    this.courier.set(null);
    this.trackingNumber.set('');
    this.international.set(null);
    this.note.set('');
    this.voice.set(null);
    this.articles.set([this.newArticle()]);
  }

  private prefill(o: OrderDetail): void {
    this.brand.set(o.brand_ref ?? (o.brand_id ? { id: o.brand_id, name: o.brand } : null));
    this.brandOrderNumber.set(o.brand_order_number ?? '');
    this.courier.set(o.courier ?? null);
    this.trackingNumber.set(o.tracking_number ?? '');
    this.international.set(o.international_shipping ?? (o.shipping_service === 'express' ? true : o.shipping_service === 'standard' ? false : null));
    this.note.set(o.customer_notes ?? '');
    const names: Record<string, string> = {};
    this.articles.set(
      o.units.map((u, i) => {
        const picks: Record<string, Article> = {};
        for (const s of u.selected_articles ?? []) {
          picks[s.article_type_id] = { id: s.article_id, article_type_id: s.article_type_id, name: s.name, image_url: s.image_url };
          names[s.article_type_id] = s.type_name;
        }
        return {
          ...this.newArticle(),
          id: u.id,
          existingImages: u.reference_images ?? [],
          open: i === 0,
          product_link: u.product_link ?? '',
          unit_title: u.unit_title ?? '',
          product_image_url: u.product_image_url ?? '',
          size_chart_id: u.size_chart_id ?? '',
          picks,
          notes: u.notes ?? '',
          notes_audio: u.notes_audio ?? undefined,
          audioHad: !!u.notes_audio,
          quantity: u.quantity || 1,
        };
      }),
    );
    this.typeNames.update((m) => ({ ...m, ...names }));
    if (this.articles().length === 0) this.articles.set([this.newArticle()]);
  }

  // ───────── step 1 helpers ─────────

  touch(field: FieldKey): void {
    this.touched.update((s) => new Set(s).add(field));
  }

  showError(field: FieldKey): boolean {
    return (this.showErrors() || this.touched().has(field)) && !!this.step1Errors()[field];
  }

  onBrandCreate(name: string): void {
    this.creatingBrand.set(true);
    this.catalog.createBrand(name).subscribe({
      next: ({ data }) => {
        this.brand.set(data);
        this.creatingBrand.set(false);
        this.toast.success('Brand added');
      },
      error: (err) => {
        this.creatingBrand.set(false);
        this.toast.error(err);
      },
    });
  }

  onIntlKey(e: KeyboardEvent): void {
    this.radioKey(e, [true, false], this.international(), (v) => this.chooseInternational(v));
  }

  hostOf(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  chooseInternational(value: boolean): void {
    this.international.set(value);
    this.touch('international');
  }

  /** Radio-group keyboard support: arrows move the selection, as native radios do. */
  radioKey<T>(event: KeyboardEvent, values: readonly T[], current: T | null, set: (v: T) => void): void {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const d = keys[event.key];
    if (!d) return;
    event.preventDefault();
    const i = current === null ? (d > 0 ? -1 : 0) : values.indexOf(current);
    const n = (i + d + values.length) % values.length;
    set(values[n]);
    (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[n]?.focus();
  }

  private focusFirstInvalid(): void {
    const e = this.step1Errors();
    setTimeout(() => {
      if (e.brand) this.brandSel()?.focus();
      else if (e.courier) this.courierSel()?.focus();
      else if (e.tracking) document.getElementById('trk')?.focus();
      else if (e.international) document.getElementById('intl-yes')?.focus();
    }, 50);
  }

  // ───────── articles ─────────

  private newArticle(): ArticleDraft {
    return {
      key: ++this.seq,
      open: true,
      product_link: '',
      unit_title: '',
      titleFromLink: false,
      product_image_url: '',
      preview: { state: 'idle', message: null },
      size_chart_id: '',
      picks: {},
      notes: '',
      notes_audio: undefined,
      audioHad: false,
      quantity: 1,
      existingImages: [],
      photos: [],
      processing: false,
    };
  }

  addArticle(): void {
    if (this.articles().length >= MAX_ARTICLES) {
      this.toast.info(`An order can have at most ${MAX_ARTICLES} articles.`);
      return;
    }
    const prev = this.articles().at(-1);
    const next = this.newArticle();
    // Handy defaults: same size chart and customisation as the previous article
    if (prev) {
      next.size_chart_id = prev.size_chart_id;
      next.picks = { ...prev.picks };
    }
    this.articles.update((list) => [...list.map((a) => ({ ...a, open: false })), next]);
  }

  removeArticle(a: ArticleDraft): void {
    if (this.articles().length <= 1) return;
    this.previewSubs.get(a.key)?.unsubscribe();
    this.articles.update((list) => list.filter((x) => x.key !== a.key));
  }

  toggleArticle(a: ArticleDraft): void {
    this.patchArticle(a.key, { open: !a.open });
  }

  patchArticle(key: number, patch: Partial<ArticleDraft>): void {
    this.articles.update((list) => list.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  hasErrors(index: number): boolean {
    return Object.keys(this.articleErrors()[index] ?? {}).length > 0;
  }

  // Product

  setLink(a: ArticleDraft, link: string): void {
    this.patchArticle(a.key, { product_link: link, preview: { state: 'idle', message: null } });
  }

  fetchPreview(a: ArticleDraft): void {
    const url = a.product_link.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      this.patchArticle(a.key, { preview: { state: 'failed', message: 'Paste a full link starting with https://' } });
      return;
    }
    this.previewSubs.get(a.key)?.unsubscribe();
    this.patchArticle(a.key, { preview: { state: 'loading', message: null } });
    this.previewSubs.set(
      a.key,
      this.catalog.previewProduct(url).subscribe({
        next: ({ data: p }) => {
          const current = this.articles().find((x) => x.key === a.key);
          if (!current) return;
          if (p.ok && (p.title || p.image_url)) {
            const replaceTitle = !current.unit_title.trim() || current.titleFromLink;
            this.patchArticle(a.key, {
              unit_title: replaceTitle && p.title ? p.title : current.unit_title,
              titleFromLink: replaceTitle && !!p.title ? true : current.titleFromLink,
              product_image_url: p.image_url ?? '',
              preview: { state: 'ok', message: null },
            });
          } else {
            this.patchArticle(a.key, {
              preview: { state: 'failed', message: p.error || "We couldn't read that page. Type the product name below." },
            });
          }
        },
        error: (err: Error) => this.patchArticle(a.key, { preview: { state: 'failed', message: err.message } }),
      }),
    );
  }

  clearImage(a: ArticleDraft): void {
    this.patchArticle(a.key, { product_image_url: '' });
  }

  // Customisation

  articleFetch(typeId: string): PageFetch<Article> {
    let fn = this.articleFetchers.get(typeId);
    if (!fn) {
      fn = (page, search) => this.catalog.articles(typeId, page, search);
      this.articleFetchers.set(typeId, fn);
    }
    return fn;
  }

  pick(a: ArticleDraft, typeId: string, article: Article): void {
    this.patchArticle(a.key, { picks: { ...a.picks, [typeId]: article } });
  }

  unpick(a: ArticleDraft, typeId: string): void {
    const picks = { ...a.picks };
    delete picks[typeId];
    this.patchArticle(a.key, { picks });
  }

  /** Selected options in the partner's type order (unknown types last). */
  chips(a: ArticleDraft): { typeId: string; type: string; article: Article }[] {
    const order = new Map(this.types().map((t, i) => [t.id, i]));
    const names = this.typeNames();
    return Object.entries(a.picks)
      .map(([typeId, article]) => ({ typeId, type: names[typeId] ?? 'Option', article }))
      .sort((x, y) => (order.get(x.typeId) ?? 999) - (order.get(y.typeId) ?? 999));
  }

  /** Saved options whose type is no longer offered (once the whole type list is known): can only be removed. */
  orphanChips(a: ArticleDraft): { typeId: string; type: string; article: Article }[] {
    if (!this.typesLoaded || this.typesHasMore()) return [];
    const known = new Set(this.types().map((t) => t.id));
    return this.chips(a).filter((c) => !known.has(c.typeId));
  }

  // Other fields

  setQuantity(a: ArticleDraft, delta: number): void {
    this.patchArticle(a.key, { quantity: Math.max(1, Math.min(20, (a.quantity || 1) + delta)) });
  }

  chartOf(id: string): SizeChart | null {
    return id ? (this.charts().find((x) => x.id === id) ?? null) : null;
  }

  /** Person to preselect in the new-size form: the article's chart, else the previous article's. */
  defaultPerson = computed(() => {
    const key = this.sizeFormFor();
    if (key === null) return '';
    const list = this.articles();
    const i = list.findIndex((a) => a.key === key);
    const own = this.chartOf(list[i]?.size_chart_id ?? '');
    const prev = i > 0 ? this.chartOf(list[i - 1].size_chart_id) : null;
    return (own ?? prev)?.person_name ?? '';
  });

  chartLabel(id: string): string {
    const c = this.charts().find((x) => x.id === id);
    return c ? c.name || `${c.person_name} · ${c.variation}` : 'No size chart';
  }

  onChartSelect(a: ArticleDraft, value: string, select: HTMLSelectElement): void {
    if (value === '__new__') {
      this.sizeFormFor.set(a.key);
      // put the select back on the current choice until the new chart is saved
      select.value = a.size_chart_id;
      return;
    }
    this.patchArticle(a.key, { size_chart_id: value });
  }

  onChartCreated(chart: SizeChart): void {
    this.charts.update((list) => [...list, chart]);
    const key = this.sizeFormFor();
    if (key !== null) this.patchArticle(key, { size_chart_id: chart.id });
    this.sizeFormFor.set(null);
  }

  async onPhotos(a: ArticleDraft, event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const files = Array.from(inputEl.files ?? []);
    inputEl.value = '';
    if (!files.length) return;
    const room = MAX_PHOTOS - a.photos.length - a.existingImages.length;
    if (room <= 0) {
      this.toast.info(`You can attach up to ${MAX_PHOTOS} photos per article.`);
      return;
    }
    if (files.length > room) this.toast.info(`Only the first ${room} photo${room === 1 ? '' : 's'} were added (max ${MAX_PHOTOS}).`);

    this.patchArticle(a.key, { processing: true });
    const added: ImageUpload[] = [];
    for (const file of files.slice(0, room)) {
      try {
        added.push(await compressImage(file));
      } catch (err) {
        this.toast.error(err);
      }
    }
    const current = this.articles().find((x) => x.key === a.key);
    if (!current) return;
    this.patchArticle(a.key, { processing: false, photos: [...current.photos, ...added].slice(0, MAX_PHOTOS - current.existingImages.length) });
  }

  removePhoto(a: ArticleDraft, index: number): void {
    this.patchArticle(a.key, { photos: a.photos.filter((_, i) => i !== index) });
  }

  removeExisting(a: ArticleDraft, index: number): void {
    this.patchArticle(a.key, { existingImages: a.existingImages.filter((_, i) => i !== index) });
  }

  // ───────── voice note ─────────

  onVoice(rec: VoiceRecording): void {
    this.voice.set(rec);
  }

  deleteVoice(): void {
    this.voice.set(null);
  }

  setAudioBusy(key: number, busy: boolean): void {
    this.uploading.update((s) => {
      const next = new Set(s);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // ───────── steps ─────────

  goTo(step: Step): void {
    if (step > 1 && !this.step1Valid()) {
      this.showErrors.set(true);
      this.step.set(1);
      this.focusFirstInvalid();
      return;
    }
    if (step > 2 && !this.step2Valid()) {
      this.showErrors.set(true);
      this.step.set(2);
      // open the articles with errors
      const errs = this.articleErrors();
      this.articles.update((list) => list.map((a, i) => (Object.keys(errs[i]).length ? { ...a, open: true } : a)));
      this.toast.error('Please complete the highlighted articles.');
      return;
    }
    this.showErrors.set(false);
    this.step.set(step);
    document.querySelector('.shell-main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  next(): void {
    if (this.anyUploading()) {
      this.toast.info('A voice note is still saving. One moment.');
      return;
    }
    this.goTo(Math.min(3, this.step() + 1) as Step);
  }

  back(): void {
    this.goTo(Math.max(1, this.step() - 1) as Step);
  }

  // ───────── submit ─────────

  private buildBody(): OrderInput {
    return {
      brand_id: this.brand()!.id,
      courier_id: this.courier()!.id,
      tracking_number: this.trackingNumber().trim() || null,
      international_shipping: this.international() === true,
      brand_order_number: this.brandOrderNumber().trim() || null,
      note: this.note().trim() || null,
      ...(this.fromImport && !this.id() ? { import_id: this.fromImport } : {}),
      units: this.articles().map((a): UnitInput => {
        const unit: UnitInput = {
          unit_title: a.unit_title.trim(),
          product_link: a.product_link.trim() || null,
          product_image_url: a.product_image_url || null,
          size_chart_id: a.size_chart_id || null,
          notes: a.notes.trim() || null,
          quantity: a.quantity,
          article_ids: Object.values(a.picks).map((x) => x.id),
        };
        const va = voiceField(a.notes_audio, a.audioHad);
        if (va.has) unit.notes_audio = va.value;
        if (a.id) {
          unit.id = a.id;
          unit.reference_images = a.existingImages;
        }
        if (a.photos.length) unit.reference_uploads = a.photos;
        return unit;
      }),
    };
  }

  submit(): void {
    if (!this.step1Valid() || !this.step2Valid()) {
      this.goTo(3);
      return;
    }
    if (this.articles().some((a) => a.processing)) {
      this.toast.info('Photos are still being prepared — one moment.');
      return;
    }
    if (this.recordingVoice()) {
      this.toast.info('Stop the recording first.');
      return;
    }
    if (this.anyUploading()) {
      this.toast.info('A voice note is still saving. One moment.');
      return;
    }
    this.submitting.set(true);
    this.submitError.set(null);
    const body = this.buildBody();
    const id = this.id();
    const wasDraft = this.isDraft();
    const req$ = id ? this.orders.update(id, body) : this.orders.create(body);
    req$.subscribe({
      next: async ({ data, message }) => {
        const voiceOk = await this.sendVoiceNote(data.id);
        this.submitting.set(false);
        this.clearDraft();
        if (voiceOk) this.toast.success(message || (id && !wasDraft ? 'Order updated.' : 'Order created.'));
        else this.toast.error('Order created, but the voice note could not be sent. Send it from the chat.', undefined, 7000);
        void this.router.navigate(['/app/orders', data.id], { queryParams: id && !wasDraft ? {} : { created: 1 } });
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(errorMessage(err));
        this.toast.error(err);
      },
    });
  }

  /** Upload the recording and post it as the first voice message. True when there was nothing to send or it worked. */
  private async sendVoiceNote(orderId: string): Promise<boolean> {
    const rec = this.voice();
    if (!rec) return true;
    try {
      const { data } = await firstValueFrom(this.chat.uploadVoice(orderId, { dataUrl: rec.dataUrl, duration: rec.duration }));
      await firstValueFrom(
        this.chat.send(orderId, {
          kind: 'voice',
          audio: { path: data.path, duration: data.duration, mime: data.mime, size: data.size },
          client_msg_id: `order-voice-${orderId}`,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
