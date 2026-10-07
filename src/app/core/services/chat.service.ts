import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ApiResult, ChatMessage, Conversation, MessagesMeta, OrderConversation, Paged, VoiceUpload } from '../models/api.models';

export interface VoicePayload {
  path: string;
  duration: number;
  mime: string;
  size: number;
}

export type SendBody =
  | { kind: 'text'; body: string; client_msg_id: string; unit_id?: string }
  | { kind: 'voice'; audio: VoicePayload; client_msg_id: string; unit_id?: string };

/** REST side of the order conversation (/client/orders/:id/messages…). The socket mirrors it in real time. */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private api = inject(ApiService);

  private path(orderId: string, tail = ''): string {
    return `/client/orders/${encodeURIComponent(orderId)}/messages${tail}`;
  }

  /** Every order of mine that has chats, each with its General + article chats and unread counts, in one call. */
  mine(): Observable<OrderConversation[]> {
    return this.api.get<OrderConversation[]>('/client/conversations');
  }

  /** The chats of one order (General + one per article) with unread counts. */
  scopes(orderId: string): Observable<Conversation> {
    return this.api.get<Conversation>(`/client/orders/${encodeURIComponent(orderId)}/conversation`);
  }

  /** `unitId`: an article's uuid or `'general'`. */
  history(orderId: string, opts: { before?: string | null; limit?: number; unitId?: string } = {}): Observable<Paged<ChatMessage, MessagesMeta>> {
    return this.api.getPage<ChatMessage, MessagesMeta>(this.path(orderId), { limit: opts.limit ?? 30, before: opts.before, unit_id: opts.unitId });
  }

  send(orderId: string, body: SendBody): Observable<ApiResult<ChatMessage>> {
    return this.api.post<ChatMessage>(this.path(orderId), body);
  }

  /** Audio goes over HTTP (never the socket); the result is then sent as a voice message. */
  uploadVoice(orderId: string, audio: { dataUrl: string; duration: number }): Observable<ApiResult<VoiceUpload>> {
    return this.api.post<VoiceUpload>(this.path(orderId, '/voice-upload'), { audio });
  }

  markRead(orderId: string, unitId?: string): Observable<ApiResult<{ updated: number }>> {
    return this.api.post<{ updated: number }>(this.path(orderId, '/read'), unitId ? { unit_id: unitId } : {});
  }
}
