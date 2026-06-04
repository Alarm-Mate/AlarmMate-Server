import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code.enum';

const ERROR_STATUS_MAP: Record<ErrorCode, HttpStatus> = {
  [ErrorCode.EMAIL_ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [ErrorCode.NICKNAME_ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [ErrorCode.INVALID_PASSWORD_FORMAT]: HttpStatus.BAD_REQUEST,
  [ErrorCode.INVALID_CREDENTIALS]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.INVALID_REFRESH_TOKEN]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.INVALID_RESET_TOKEN]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorCode.ALARM_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.GROUP_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.NOT_GROUP_MEMBER]: HttpStatus.FORBIDDEN,
  [ErrorCode.ALREADY_MEMBER]: HttpStatus.CONFLICT,
  [ErrorCode.OWNER_CANNOT_LEAVE]: HttpStatus.CONFLICT,
  [ErrorCode.INVITATION_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.ALREADY_FOLLOWING]: HttpStatus.CONFLICT,
  [ErrorCode.CANNOT_FOLLOW_SELF]: HttpStatus.BAD_REQUEST,
  [ErrorCode.ALREADY_WOKE_TODAY]: HttpStatus.CONFLICT,
  [ErrorCode.USER_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.NOTIFICATION_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.SOUND_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.VALIDATION_ERROR]: HttpStatus.BAD_REQUEST,
  [ErrorCode.INTERNAL_SERVER_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  [ErrorCode.EMAIL_ALREADY_EXISTS]: 'Email already exists',
  [ErrorCode.NICKNAME_ALREADY_EXISTS]: 'Nickname already exists',
  [ErrorCode.INVALID_PASSWORD_FORMAT]: 'Password must be at least 8 characters and contain letters and digits',
  [ErrorCode.INVALID_CREDENTIALS]: 'Invalid credentials',
  [ErrorCode.INVALID_REFRESH_TOKEN]: 'Invalid refresh token',
  [ErrorCode.INVALID_RESET_TOKEN]: 'Invalid or expired reset token',
  [ErrorCode.UNAUTHORIZED]: 'Unauthorized',
  [ErrorCode.FORBIDDEN]: 'Forbidden',
  [ErrorCode.ALARM_NOT_FOUND]: 'Alarm not found',
  [ErrorCode.GROUP_NOT_FOUND]: 'Group not found',
  [ErrorCode.NOT_GROUP_MEMBER]: 'Not a group member',
  [ErrorCode.ALREADY_MEMBER]: 'Already a member',
  [ErrorCode.OWNER_CANNOT_LEAVE]: 'Owner cannot leave the group',
  [ErrorCode.INVITATION_NOT_FOUND]: 'Invitation not found',
  [ErrorCode.ALREADY_FOLLOWING]: 'Already following',
  [ErrorCode.CANNOT_FOLLOW_SELF]: 'Cannot follow yourself',
  [ErrorCode.ALREADY_WOKE_TODAY]: 'Already woke up today for this alarm',
  [ErrorCode.USER_NOT_FOUND]: 'User not found',
  [ErrorCode.NOTIFICATION_NOT_FOUND]: 'Notification not found',
  [ErrorCode.SOUND_NOT_FOUND]: 'Sound not found',
  [ErrorCode.VALIDATION_ERROR]: 'Validation error',
  [ErrorCode.INTERNAL_SERVER_ERROR]: 'Internal server error',
};

export class AppException extends HttpException {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGE[code], ERROR_STATUS_MAP[code]);
    this.code = code;
  }
}
