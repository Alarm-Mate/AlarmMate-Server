import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code.enum';

interface FailureBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, body } = this.resolve(exception);
    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    body: FailureBody;
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: {
          success: false,
          error: { code: exception.code, message: exception.message },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = this.extractHttpMessage(exception);
      const code = this.mapStatusToCode(status);
      return {
        status,
        body: { success: false, error: { code, message } },
      };
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        },
      },
    };
  }

  private extractHttpMessage(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (typeof response === 'object' && response !== null) {
      const record = response as Record<string, unknown>;
      const message = record.message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message)) {
        return message.map((m) => String(m)).join(', ');
      }
    }
    return exception.message;
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      default:
        return ErrorCode.INTERNAL_SERVER_ERROR;
    }
  }
}
