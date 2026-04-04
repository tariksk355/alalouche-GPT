import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const response = ctx.getResponse<Response>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : null;

    const error = typeof payload === 'object' && payload && 'error' in payload ? String((payload as any).error) : 'INTERNAL_ERROR';
    const rawMessage = typeof payload === 'object' && payload && 'message' in payload ? (payload as any).message : 'Unexpected server error.';
    const message = Array.isArray(rawMessage) ? rawMessage.join('; ') : String(rawMessage);

    const requestId = request?.requestId || request?.header('x-request-id') || null;
    const path = request?.originalUrl || request?.url || 'unknown';
    const method = request?.method || 'unknown';

    this.logger.error(
      JSON.stringify({
        event: 'http_exception',
        requestId,
        method,
        path,
        status,
        error,
        message,
      }),
    );

    const safeMessage = status >= 500 && process.env.NODE_ENV === 'production' ? 'Unexpected server error.' : message;

    response.status(status).json({
      ok: false,
      error,
      message: safeMessage,
      requestId,
      timestamp: new Date().toISOString(),
      path,
    });
  }
}
