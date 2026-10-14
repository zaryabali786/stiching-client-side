import { SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ChatSocketService } from '../../core/services/chat-socket.service';
import { MailboxService } from '../../core/services/mailbox.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/services/api.service';
import { InboxEmail, InboxRow, Mailbox } from '../../core/models/api.models';
import { compressImage, copyText } from '../../core/utils/image';
import { TimeAgoPipe } from '../../shared/time-ago.pipe';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../shared/ui-states';

const PAGE = 20;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

/** Some browsers leave `file.type` empty for Office files: fall back to the extension. */
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  rtf: 'application/rtf',
  zip: 'application/zip',
};
const BLOCKED = /\.(exe|bat|cmd|com|scr|js|jse|vbs|msi|jar|dll|ps1|sh|apk)$/i;

/** A file ready to send (and to preview in the composer). */
export interface Attachment {
  name: string;
  dataUrl: string;
  type: string;
  size: number;
  isImage: boolean;
}

const dataUrlSize = (dataUrl: string): number => Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });

/** Icon for a non-image file. */
export const fileIcon = (name: string, type: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (type.startsWith('image/')) return 'image-outline';
  if (ext === 'pdf') return 'document-text-outline';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'grid-outline';
  if (ext === 'zip') return 'archive-outline';
  return 'document-outline';
};

export const fileSize = (bytes: number): string => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const MAX_FRAME_HEIGHT = 30_000;

/** "Sapphire <orders@x.com>" -> "Sapphire", "orders@x.com" -> "orders@x.com" */
const senderName = (from: string | null): string => {
  const f = (from ?? '').trim();
  const name = /^"?([^"<]+?)"?\s*</.exec(f)?.[1]?.trim();
  return name || f.replace(/[<>]/g, '') || 'Unknown sender';
};

/**
 * The customer's Inbox: the address to type at any shop's checkout, every email that arrives there, and — for order
 * emails — the order read from it, ready to turn into an order (/app/inbox and /app/inbox/:id).
 */
@Component({
  selector: 'app-inbox',
  imports: [SlicePipe, RouterLink, IonIcon, IonSpinner, TimeAgoPipe, SkeletonComponent, EmptyStateComponent, ErrorStateComponent],
  templateUrl: './inbox.page.html',
  styleUrl: './inbox.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InboxPage {
  private mail = inject(MailboxService);
  private auth = inject(AuthService);
  private socket = inject(ChatSocketService);
  private toast = inject(ToastService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  /** Route param: an email is open when set (bound by withComponentInputBinding). */
  readonly id = input<string>();

  readonly senderName = senderName;

  // address
  box = signal<Mailbox | null>(null);
  copied = signal(false);
  /** Known right after sign-in, before the address call returns. */
  address = computed(() => this.box()?.address ?? this.auth.user()?.mailbox_address ?? null);

  // list
  rows = signal<InboxRow[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  error = signal<string | null>(null);
  hasMore = signal(false);
  unreadOnly = signal(false);
  sentOnly = signal(false);
  unread = this.mail.unread;
  private page = 1;
  private listSub?: Subscription;

  // composer (a new email, or a reply to the open one)
  composing = signal(false);
  replyTo = signal<InboxEmail | null>(null);
  to = signal('');
  subject = signal('');
  text = signal('');
  files = signal<Attachment[]>([]);
  dragging = signal(false);
  /** the "discard this email?" popup */
  confirmingDiscard = signal(false);
  readonly fileIcon = fileIcon;
  readonly fileSize = fileSize;
  totalSize = computed(() => this.files().reduce((n, f) => n + f.size, 0));
  private bodyBox = viewChild<ElementRef<HTMLTextAreaElement>>('bodyBox');
  sending = signal(false);
  readonly maxFiles = MAX_FILES;
  canSend = computed(() => this.box()?.can_send !== false);

  // detail
  email = signal<InboxEmail | null>(null);
  detailLoading = signal(false);
  detailError = signal<string | null>(null);
  deleting = signal(false);
  private detailSub?: Subscription;

  /** The email's HTML inside a sandboxed frame: no scripts can run, links open in a new tab. */
  frame = computed<SafeHtml | null>(() => {
    const html = this.email()?.html;
    if (!html) return null;
    const doc =
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data:; style-src \'unsafe-inline\'; font-src https: data:">' +
      '<base target="_blank"><style>body{margin:0;padding:12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;word-break:break-word}img{max-width:100%;height:auto}</style>' +
      `</head><body>${html}</body></html>`;
    // Safe by construction: the frame is sandboxed without allow-scripts (so allow-same-origin only lets this page measure it) and the CSP above blocks scripts
    return this.sanitizer.bypassSecurityTrustHtml(doc);
  });

  private frameObserver?: ResizeObserver;

  /**
   * Make the email frame as tall as its content. The frame then never scrolls on its own: the page is the only scroller, so a
   * long email can be read to the bottom (and the buttons under it reached) with one swipe or wheel, on any screen size.
   */
  fitFrame(frame: HTMLIFrameElement): void {
    this.frameObserver?.disconnect();
    let doc: Document | null = null;
    try {
      doc = frame.contentDocument;
    } catch {
      doc = null;
    }
    const body = doc?.body;
    if (!doc || !body) return; // unreadable: the frame keeps its fixed height and scrolls inside
    const fit = () => {
      const h = Math.ceil(Math.max(body.scrollHeight, body.offsetHeight) + 1);
      // a pathological email must not make an endless page
      frame.style.height = `${Math.min(Math.max(h, 120), MAX_FRAME_HEIGHT)}px`;
      frame.classList.add('fitted');
    };
    fit();
    // images and fonts arrive later, and a rotated phone re-wraps the text
    if (typeof ResizeObserver !== 'undefined') {
      this.frameObserver = new ResizeObserver(() => fit());
      this.frameObserver.observe(body);
    }
  }

  constructor() {
    this.mail.address().pipe(takeUntilDestroyed()).subscribe({ next: (b) => this.box.set(b), error: () => undefined });

    effect(() => {
      const id = this.id();
      untracked(() => (id ? this.openEmail(id) : this.loadList()));
    });

    // Live: a new email refreshes the list; a finished order draft refreshes the open email
    this.socket.mailbox$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (!this.id()) this.loadList(true);
      else if (e.kind === 'update' && e.id === this.id()) this.openEmail(e.id, true);
    });

    this.destroyRef.onDestroy(() => {
      this.listSub?.unsubscribe();
      this.detailSub?.unsubscribe();
      this.frameObserver?.disconnect();
    });
  }

  // ───────── list ─────────

  /** `quiet`: refresh in place (no skeleton) after a live event. */
  loadList(quiet = false): void {
    this.listSub?.unsubscribe();
    this.page = 1;
    if (!quiet) this.loading.set(true);
    this.error.set(null);
    this.listSub = this.mail.list({ page: 1, limit: PAGE, unread: this.unreadOnly(), sent: this.sentOnly() }).subscribe({
      next: ({ items, meta }) => {
        this.rows.set(items);
        this.hasMore.set(!!meta.hasMore);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    });
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.mail.list({ page: this.page + 1, limit: PAGE, unread: this.unreadOnly(), sent: this.sentOnly() }).subscribe({
      next: ({ items, meta }) => {
        const seen = new Set(this.rows().map((r) => r.id));
        this.rows.update((list) => [...list, ...items.filter((r) => !seen.has(r.id))]);
        this.page += 1;
        this.hasMore.set(!!meta.hasMore);
        this.loadingMore.set(false);
      },
      error: (err: unknown) => {
        this.toast.error(err);
        this.loadingMore.set(false);
      },
    });
  }

  toggleUnread(): void {
    this.unreadOnly.update((v) => !v);
    this.loadList();
  }

  showSent(sent: boolean): void {
    if (this.sentOnly() === sent) return;
    this.sentOnly.set(sent);
    this.unreadOnly.set(false);
    this.loadList();
  }

  markAllRead(): void {
    this.mail.readAll().subscribe({
      next: () => this.rows.update((list) => list.map((r) => ({ ...r, is_read: true }))),
      error: (err: unknown) => this.toast.error(err),
    });
  }

  async copyAddress(): Promise<void> {
    const a = this.address();
    if (!a) return;
    if (await copyText(a)) {
      this.toast.success("Email address copied — paste it at the shop's checkout.");
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } else {
      this.toast.error('Could not copy — your address is ' + a + '.');
    }
  }

  // ───────── detail ─────────

  openEmail(id: string, quiet = false): void {
    this.detailSub?.unsubscribe();
    if (!quiet) {
      this.detailLoading.set(true);
      this.email.set(null);
    }
    this.detailError.set(null);
    this.detailSub = this.mail.open(id).subscribe({
      next: (e) => {
        this.email.set(e);
        this.detailLoading.set(false);
      },
      error: (err: Error) => {
        this.detailError.set(err.message);
        this.detailLoading.set(false);
      },
    });
  }

  // ───────── compose / reply ─────────

  compose(reply: InboxEmail | null = null): void {
    this.replyTo.set(reply);
    this.to.set('');
    this.subject.set(reply ? (/^re:/i.test(reply.subject ?? '') ? reply.subject! : `Re: ${reply.subject ?? ''}`.trim()) : '');
    this.text.set('');
    this.files.set([]);
    this.dragging.set(false);
    this.confirmingDiscard.set(false);
    this.composing.set(true);
    setTimeout(() => this.bodyBox()?.nativeElement.focus(), 60);
  }

  /** Close the popup; ask first if something was written, so a draft is not lost by a stray tap. */
  closeComposer(force = false): void {
    if (this.sending()) return;
    const dirty = !!this.text().trim() || this.files().length > 0 || (!this.replyTo() && !!this.to().trim());
    if (!force && dirty) {
      this.confirmingDiscard.set(true);
      return;
    }
    this.confirmingDiscard.set(false);
    this.composing.set(false);
  }

  /** "Keep writing" in the discard popup */
  keepWriting(): void {
    this.confirmingDiscard.set(false);
    setTimeout(() => this.bodyBox()?.nativeElement.focus(), 0);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.confirmingDiscard()) this.keepWriting();
    else if (this.composing()) this.closeComposer();
  }

  /** Ctrl/Cmd + Enter sends. */
  onBodyKey(ev: KeyboardEvent): void {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
      ev.preventDefault();
      this.send();
    }
  }

  input(signalRef: { set(v: string): void }, ev: Event): void {
    signalRef.set((ev.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  onPick(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    void this.addFiles(picked);
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragging.set(false);
    void this.addFiles(Array.from(ev.dataTransfer?.files ?? []));
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    this.dragging.set(true);
  }

  /** A picture pasted into the message becomes an attachment. */
  onPaste(ev: ClipboardEvent): void {
    const pics = Array.from(ev.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (!pics.length) return;
    ev.preventDefault();
    void this.addFiles(pics);
  }

  async addFiles(picked: File[]): Promise<void> {
    for (const f of picked) {
      if (this.files().length >= MAX_FILES) {
        this.toast.error(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      const type = f.type || MIME_BY_EXT[ext] || '';
      const isImage = type.startsWith('image/');
      if (BLOCKED.test(f.name) || (!isImage && !Object.values(MIME_BY_EXT).includes(type))) {
        this.toast.error(`${f.name} can't be attached. Use photos, PDF, Word, Excel, PowerPoint, text or zip files.`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES * 3) {
        this.toast.error(`${f.name} is too big (max 8 MB).`);
        continue;
      }
      try {
        let a: Attachment;
        if (isImage) {
          const img = await compressImage(f);
          a = { name: img.name, dataUrl: img.dataUrl, type: img.dataUrl.slice(5, img.dataUrl.indexOf(';')), size: dataUrlSize(img.dataUrl), isImage: true };
        } else {
          const raw = await readAsDataUrl(f);
          // normalise the media type (the browser may have guessed none)
          const dataUrl = raw.replace(/^data:[^;,]*/, `data:${type}`);
          a = { name: f.name, dataUrl, type, size: f.size, isImage: false };
        }
        if (a.size > MAX_FILE_BYTES) {
          this.toast.error(`${f.name} is too big (max 8 MB).`);
          continue;
        }
        if (this.totalSize() + a.size > MAX_TOTAL_BYTES) {
          this.toast.error('Attachments are limited to 10 MB in total.');
          break;
        }
        this.files.update((l) => [...l, a]);
      } catch (err) {
        this.toast.error(errorMessage(err));
      }
    }
  }

  removeFile(i: number): void {
    this.files.update((l) => l.filter((_, idx) => idx !== i));
  }

  send(): void {
    if (this.sending()) return;
    const reply = this.replyTo();
    if (!reply && !this.to().trim()) return void this.toast.error('Enter who the email is for.');
    if (!this.text().trim() && !this.files().length) return void this.toast.error('Write a message or add a file.');
    this.sending.set(true);
    this.mail
      .send({
        to: reply ? undefined : this.to().trim(),
        subject: this.subject().trim(),
        text: this.text(),
        replyToId: reply?.id,
        attachments: this.files().map((f) => ({ name: f.name, dataUrl: f.dataUrl })),
      })
      .subscribe({
        next: () => {
          this.toast.success('Email sent.');
          this.sending.set(false);
          this.composing.set(false);
          if (!this.id()) this.loadList(true);
        },
        error: (err: unknown) => {
          this.toast.error(errorMessage(err));
          this.sending.set(false);
        },
      });
  }

  remove(): void {
    const e = this.email();
    if (!e || this.deleting()) return;
    this.deleting.set(true);
    this.mail.remove(e.id).subscribe({
      next: () => {
        this.toast.success('Email deleted.');
        this.deleting.set(false);
        void this.router.navigate(['/app/inbox']);
      },
      error: (err: unknown) => {
        this.toast.error(errorMessage(err));
        this.deleting.set(false);
      },
    });
  }
}
