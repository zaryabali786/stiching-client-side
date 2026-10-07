import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ApiResult, VoiceUpload } from '../models/api.models';

/** Uploads a recorded voice note next to a text note (POST /client/voice-upload). */
@Injectable({ providedIn: 'root' })
export class VoiceService {
  private api = inject(ApiService);

  upload(audio: { dataUrl: string; duration: number }): Observable<ApiResult<VoiceUpload>> {
    return this.api.post<VoiceUpload>('/client/voice-upload', { audio });
  }
}
