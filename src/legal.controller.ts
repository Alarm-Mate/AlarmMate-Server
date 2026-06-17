import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from './common/decorators/public.decorator';

const EFFECTIVE_DATE = '2026년 6월 11일';
const CONTACT_EMAIL = 'seoj080829@gmail.com';

// 앱 설정·App Store Connect 에서 링크하는 개인정보처리방침 페이지.
// HTML 그대로 내려야 하므로 ResponseInterceptor(JSON 래핑)를 @Res 로 우회한다.
const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>알람메이트 개인정보처리방침</title>
<style>
  body { font-family: -apple-system, "Apple SD Gothic Neo", sans-serif; line-height: 1.7; max-width: 720px; margin: 0 auto; padding: 24px 20px 64px; color: #1c1c2e; }
  h1 { font-size: 24px; } h2 { font-size: 18px; margin-top: 32px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { border: 1px solid #d5d5e0; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #f4f4fa; }
  .meta { color: #6b6b7a; font-size: 14px; }
</style>
</head>
<body>
<h1>알람메이트 개인정보처리방침</h1>
<p class="meta">시행일: ${EFFECTIVE_DATE}</p>
<p>알람메이트(이하 "서비스")는 이용자의 개인정보를 소중히 여기며, 「개인정보 보호법」 등 관련 법령을 준수합니다. 본 방침은 서비스가 어떤 정보를 왜 수집하고, 어떻게 보관·이용·파기하는지를 설명합니다.</p>

<h2>1. 수집하는 개인정보와 이용 목적</h2>
<table>
  <tr><th>항목</th><th>수집 시점</th><th>목적</th></tr>
  <tr><td>이메일, 비밀번호(암호화 저장), 닉네임</td><td>회원가입</td><td>계정 생성·로그인, 비밀번호 재설정</td></tr>
  <tr><td>생년월일(선택), 프로필 사진(선택), 자기소개(선택)</td><td>프로필 설정</td><td>프로필 표시</td></tr>
  <tr><td>위치 정보(현재 위치)</td><td>막차·약속 알람 생성 시</td><td>이동 시간 계산 및 알람 시각 산출(경로 계산에만 사용하며 위치 이력을 추적하지 않습니다)</td></tr>
  <tr><td>알람·기상 기록(알람 시각, 기상 시각)</td><td>서비스 이용</td><td>스트릭·기상 달력 등 핵심 기능 제공</td></tr>
  <tr><td>푸시 토큰·기기 식별자</td><td>알림 동의 시</td><td>푸시 알림 발송(OneSignal)</td></tr>
</table>

<h2>2. 제3자 제공 및 처리 위탁</h2>
<p>서비스는 개인정보를 외부에 판매하지 않으며, 운영을 위해 아래 업체에 처리를 위탁합니다.</p>
<table>
  <tr><th>수탁사</th><th>위탁 내용</th></tr>
  <tr><td>Railway (미국)</td><td>서버·데이터베이스 호스팅</td></tr>
  <tr><td>Amazon Web Services (S3)</td><td>프로필 사진·알람음 파일 저장</td></tr>
  <tr><td>OneSignal (미국)</td><td>푸시 알림 발송(푸시 토큰 처리)</td></tr>
</table>

<h2>3. 보유 기간 및 파기</h2>
<p>개인정보는 회원 탈퇴 시 지체 없이 파기됩니다. 앱 내 [설정 → 계정 → 회원 탈퇴]에서 직접 계정과 데이터를 삭제할 수 있습니다. 관련 법령에 따라 보존 의무가 있는 정보는 해당 기간 동안만 보관 후 파기합니다.</p>

<h2>4. 이용자의 권리</h2>
<p>이용자는 언제든지 앱 내에서 본인의 개인정보를 조회·수정·삭제할 수 있으며, 아래 연락처로 열람·정정·삭제·처리정지를 요청할 수 있습니다.</p>

<h2>5. 안전성 확보 조치</h2>
<p>비밀번호는 단방향 암호화(bcrypt)하여 저장하며, 모든 통신은 HTTPS로 암호화됩니다. 접근 권한은 운영에 필요한 최소 인원으로 제한합니다.</p>

<h2>6. 아동의 개인정보</h2>
<p>서비스는 만 14세 미만 아동의 개인정보를 의도적으로 수집하지 않습니다.</p>

<h2>7. 문의처</h2>
<p>개인정보 보호 관련 문의: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>

<h2>8. 방침의 변경</h2>
<p>본 방침이 변경되는 경우 앱 내 공지사항을 통해 사전 안내합니다.</p>
</body>
</html>`;

// App Store "지원 URL" 용 간단한 지원/문의 페이지.
const SUPPORT_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>알람메이트 지원</title>
<style>
  body { font-family: -apple-system, "Apple SD Gothic Neo", sans-serif; line-height: 1.7; max-width: 640px; margin: 0 auto; padding: 32px 20px 64px; color: #1c1c2e; }
  h1 { font-size: 24px; } h2 { font-size: 18px; margin-top: 28px; }
  a { color: #2b6cff; }
  .card { background: #f4f4fa; border-radius: 14px; padding: 18px 20px; margin-top: 16px; }
</style>
</head>
<body>
<h1>알람메이트 지원</h1>
<p>함께 일어나는 습관, 알람메이트를 이용해 주셔서 감사합니다. 문의·버그 제보·계정 관련 도움이 필요하시면 아래로 연락해 주세요.</p>

<div class="card">
  <h2>문의</h2>
  <p>이메일: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a><br/>영업일 기준 48시간 이내에 답변드립니다.</p>
</div>

<h2>자주 묻는 질문</h2>
<p><strong>알람이 울리지 않아요.</strong><br/>설정 → 알림에서 알람·알림 권한이 허용되어 있는지 확인해 주세요. 알람메이트는 iOS 26 이상에서 동작합니다.</p>
<p><strong>계정을 삭제하고 싶어요.</strong><br/>앱 내 설정 → 계정 → 회원 탈퇴에서 직접 계정과 데이터를 삭제할 수 있습니다.</p>
<p><strong>막차·약속 알람이 이상한 시각에 울려요.</strong><br/>위치 권한이 필요합니다(이동 시간 계산용). 설정에서 위치 권한을 허용하고 다시 설정해 주세요.</p>

<h2>개인정보</h2>
<p><a href="/privacy">개인정보처리방침 보기</a></p>
</body>
</html>`;

@Controller()
export class LegalController {
  @Public()
  @Get('privacy')
  privacy(@Res() res: Response): void {
    res.type('text/html; charset=utf-8').send(PRIVACY_HTML);
  }

  @Public()
  @Get('support')
  support(@Res() res: Response): void {
    res.type('text/html; charset=utf-8').send(SUPPORT_HTML);
  }
}
