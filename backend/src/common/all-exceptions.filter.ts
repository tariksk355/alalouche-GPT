import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : null;

    const error = typeof payload === 'object' && payload && 'error' in payload ? String((payload as any).error) : 'INTERNAL_ERROR';
    const message = typeof payload === 'object' && payload && 'message' in payload ? String((payload as any).message) : 'Unexpected server error.';

    response.status(status).json({ ok: false, error, message });
  }
}
