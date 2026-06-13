import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code.enum';

const ERROR_STATUS_MAP: Record<ErrorCode, HttpStatus> = {
  [ErrorCode.EMAIL_ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [ErrorCode.NICKNAME_ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [ErrorCode.INVALID_PASSWORD_FORMAT]: HttpStatus.BAD_REQUEST,
  [ErrorCode.INVALID_CREDENTIALS]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.INVALID_REFRESH_TOKEN]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.INVALID_RESET_TOKEN]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.EMAIL_NOT_VERIFIED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.INVALID_VERIFICATION_CODE]: HttpStatus.BAD_REQUEST,
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
  [ErrorCode.TOO_MANY_REQUESTS]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.VALIDATION_ERROR]: HttpStatus.BAD_REQUEST,
  [ErrorCode.MAIL_SEND_FAILED]: HttpStatus.BAD_GATEWAY,
  [ErrorCode.INTERNAL_SERVER_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

// 사용자에게 그대로 노출되므로 한국어로 작성한다(온보딩 경로 영어 노출 방지).
const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  [ErrorCode.EMAIL_ALREADY_EXISTS]: '이미 가입된 이메일이에요',
  [ErrorCode.NICKNAME_ALREADY_EXISTS]: '이미 사용 중인 닉네임이에요',
  [ErrorCode.INVALID_PASSWORD_FORMAT]: '비밀번호는 8자 이상이며 영문과 숫자를 포함해야 해요',
  [ErrorCode.INVALID_CREDENTIALS]: '이메일 또는 비밀번호가 올바르지 않아요',
  [ErrorCode.INVALID_REFRESH_TOKEN]: '로그인이 만료됐어요. 다시 로그인해주세요',
  [ErrorCode.INVALID_RESET_TOKEN]: '인증 코드가 올바르지 않거나 만료됐어요',
  [ErrorCode.EMAIL_NOT_VERIFIED]: '이메일 인증을 먼저 완료해주세요',
  [ErrorCode.INVALID_VERIFICATION_CODE]: '인증 코드가 올바르지 않거나 만료됐어요',
  [ErrorCode.UNAUTHORIZED]: '로그인이 필요해요',
  [ErrorCode.FORBIDDEN]: '권한이 없어요',
  [ErrorCode.ALARM_NOT_FOUND]: '알람을 찾을 수 없어요',
  [ErrorCode.GROUP_NOT_FOUND]: '그룹을 찾을 수 없어요',
  [ErrorCode.NOT_GROUP_MEMBER]: '그룹 멤버가 아니에요',
  [ErrorCode.ALREADY_MEMBER]: '이미 그룹에 속해 있어요',
  [ErrorCode.OWNER_CANNOT_LEAVE]: '그룹장은 그룹을 나갈 수 없어요',
  [ErrorCode.INVITATION_NOT_FOUND]: '초대를 찾을 수 없어요',
  [ErrorCode.ALREADY_FOLLOWING]: '이미 팔로우하고 있어요',
  [ErrorCode.CANNOT_FOLLOW_SELF]: '자신은 팔로우할 수 없어요',
  [ErrorCode.ALREADY_WOKE_TODAY]: '오늘은 이미 이 알람으로 기상 기록을 남겼어요',
  [ErrorCode.USER_NOT_FOUND]: '사용자를 찾을 수 없어요',
  [ErrorCode.NOTIFICATION_NOT_FOUND]: '알림을 찾을 수 없어요',
  [ErrorCode.SOUND_NOT_FOUND]: '알람음을 찾을 수 없어요',
  [ErrorCode.TOO_MANY_REQUESTS]: '잠시 후 다시 시도해주세요',
  [ErrorCode.VALIDATION_ERROR]: '입력값을 확인해주세요',
  [ErrorCode.MAIL_SEND_FAILED]: '메일 발송에 실패했어요. 잠시 후 다시 시도해주세요',
  [ErrorCode.INTERNAL_SERVER_ERROR]: '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요',
};

export class AppException extends HttpException {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGE[code], ERROR_STATUS_MAP[code]);
    this.code = code;
  }
}
