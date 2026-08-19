import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

/** What one Google Maps call came back with — HTTP status plus parsed JSON. */
export interface GoogleMapsReply {
  readonly status: number;
  readonly body: unknown;
}

/**
 * Outbound-HTTP seam for the maps proxy (issue #112). The service depends on
 * this abstract class and interprets replies; specs substitute a double, so
 * CI never makes a live call.
 */
export abstract class GoogleMapsClient {
  /**
   * One field-masked Google Maps call — GET without a body, POST with one.
   * The field mask is mandatory (Places New and Routes both require it, and
   * the requested fields decide the billed SKU). Network failures propagate
   * as thrown errors; HTTP error statuses come back in the reply.
   */
  abstract call(
    url: string,
    fieldMask: string,
    body?: unknown,
  ): Promise<GoogleMapsReply>;
}

/** The real thing — `fetch` with the API key and field mask headers. */
@Injectable()
export class FetchGoogleMapsClient extends GoogleMapsClient {
  private readonly apiKey: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.apiKey = config.get('GOOGLE_MAPS_API_KEY', { infer: true });
  }

  async call(
    url: string,
    fieldMask: string,
    body?: unknown,
  ): Promise<GoogleMapsReply> {
    const hasBody = body !== undefined;
    const response = await fetch(url, {
      method: hasBody ? 'POST' : 'GET',
      headers: {
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': fieldMask,
        ...(hasBody && { 'content-type': 'application/json' }),
      },
      ...(hasBody && { body: JSON.stringify(body) }),
    });
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }
    return { status: response.status, body: parsed };
  }
}
