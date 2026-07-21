import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { ZodSerializationException } from 'nestjs-zod';
import { ZodError } from 'zod';

/**
 * Logs the detail behind server-side failures, then defers to Nest's default
 * handling. Nest treats every {@link HttpException} — including nestjs-zod's
 * `ZodSerializationException` (an `InternalServerErrorException`) — as "handled"
 * and emits only the generic `{"message":"Internal Server Error"}` body, so a
 * response that fails schema validation otherwise 500s *silently*. This unwraps
 * the `ZodError` and logs it, and logs the stack of any other 5xx, so a 500 is
 * always diagnosable from the logs. The HTTP response itself is left unchanged
 * (`super.catch`). Non-`HttpException` errors are unaffected — Nest's built-in
 * filter already logs those.
 */
@Catch(HttpException)
export class HttpExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  override catch(exception: HttpException, host: ArgumentsHost): void {
    if (exception instanceof ZodSerializationException) {
      const zodError = exception.getZodError();
      if (zodError instanceof ZodError) {
        this.logger.error(
          `Response failed schema validation: ${zodError.message}`,
        );
      }
    } else if (exception.getStatus() >= 500) {
      this.logger.error(exception.message, exception.stack);
    }

    super.catch(exception, host);
  }
}
