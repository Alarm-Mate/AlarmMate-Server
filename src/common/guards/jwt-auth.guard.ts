import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code.enum';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      if (err instanceof UnauthorizedException) {
        throw new AppException(ErrorCode.UNAUTHORIZED, err.message);
      }
      throw new AppException(ErrorCode.UNAUTHORIZED);
    }
    return user;
  }
}
