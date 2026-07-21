import {
  type ArgumentsHost,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { ZodSerializationException } from 'nestjs-zod';
import { z } from 'zod';
import { HttpExceptionFilter } from './http-exception.filter.js';

/** A real ZodError, as a failed response serialization would produce. */
function aZodError(): z.ZodError {
  const parsed = z.object({ nickname: z.string() }).safeParse({ nickname: 1 });
  if (parsed.success) {
    throw new Error('expected the parse to fail');
  }
  return parsed.error;
}

describe('HttpExceptionFilter', () => {
  const host = {} as ArgumentsHost;
  let logError: jest.SpyInstance;
  let superCatch: jest.SpyInstance;

  beforeEach(() => {
    // Isolate the filter's own logic from Nest's response handling.
    superCatch = jest
      .spyOn(BaseExceptionFilter.prototype, 'catch')
      .mockImplementation();
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the ZodError detail behind an otherwise-silent serialization 500', () => {
    new HttpExceptionFilter().catch(
      new ZodSerializationException(aZodError()),
      host,
    );

    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('Response failed schema validation'),
    );
    expect(superCatch).toHaveBeenCalled();
  });

  it('logs any other 5xx so it is not silent', () => {
    new HttpExceptionFilter().catch(
      new InternalServerErrorException('kaboom'),
      host,
    );

    expect(logError).toHaveBeenCalled();
  });

  it('stays quiet for 4xx client errors (already meaningful to the caller)', () => {
    new HttpExceptionFilter().catch(
      new HttpException('bad request', 400),
      host,
    );

    expect(logError).not.toHaveBeenCalled();
    expect(superCatch).toHaveBeenCalled();
  });
});
