import { Injectable } from '@nestjs/common';

/**
 * Port for the current time, so token expiry and rotation logic is
 * deterministic under test (a fake clock) rather than reading the wall clock.
 */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
