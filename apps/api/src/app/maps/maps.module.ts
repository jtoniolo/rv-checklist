import { Module } from '@nestjs/common';
import {
  FetchGoogleMapsClient,
  GoogleMapsClient,
} from './google-maps.client.js';
import { MapsController } from './maps.controller.js';
import { MapsService } from './maps.service.js';

/**
 * Google Maps proxy feature module (issue #112). Binds the
 * {@link GoogleMapsClient} seam to its `fetch` implementation and registers
 * the proxy's use-case and HTTP surface. No persistence — nothing from a
 * Maps response is ever written to the database (ADR-0025).
 */
@Module({
  controllers: [MapsController],
  providers: [
    MapsService,
    { provide: GoogleMapsClient, useClass: FetchGoogleMapsClient },
  ],
})
export class MapsModule {}
