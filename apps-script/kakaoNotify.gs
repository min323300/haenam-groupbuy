/**
 * 해남공구마켓 — 새 주문 카톡 알림 (카카오 「나에게 보내기」)
 * 대표님 카톡 「나와의 채팅」으로 상품명·수량·주문자 이름을 보냅니다.
 *
 * 처음 한 번 설정
 *  1) 앱스스크립트 > 프로젝트 설정 > 스크립트 속성에 아래 2개 추가
 *       KAKAO_REST_KEY      : 카카오 디벨로퍼스 앱의 REST API 키
 *       KAKAO_CLIENT_SECRET : (보안 > Client Secret 을 '사용'으로 해둔 경우만) 그 값
 *  2) kakaoAuthUrl 실행 → 실행 로그의 주소를 열어 카카오 로그인·동의
 *  3) 이동한 페이지(haenamgonggu.kr/kakao)에 나온 코드를 복사
 *  4) kakaoSaveCode('복사한코드') 를 한 번 실행 (아래 kakaoSetup 안에 붙여넣고 실행)
 *  5) kakaoTest 실행 → 카톡 「나와의 채팅」에 테스트 메시지가 오면 끝
 *
 * 주문 저장하는 함수 안, 시트에 주문을 적은 바로 다음 줄에 이 한 줄 추가:
 *     notifyOrderKakao(상품명, 수량, 주문자이름);
 */

const KAKAO_REDIRECT_URI = 'https://haenamgonggu.kr/kakao/';

function kakaoProps_() { return PropertiesService.getScriptProperties(); }

function kakaoAuthUrl() {
  const key = kakaoProps_().getProperty('KAKAO_REST_KEY');
  if (!key) throw new Error('스크립트 속성에 KAKAO_REST_KEY 를 먼저 넣어주세요.');
  const url = 'https://kauth.kakao.com/oauth/authorize?response_type=code&scope=talk_message'
    + '&client_id=' + encodeURIComponent(key)
    + '&redirect_uri=' + encodeURIComponent(KAKAO_REDIRECT_URI);
  Logger.log('아래 주소를 브라우저에서 여세요:\n' + url);
  return url;
}

function kakaoTokenRequest_(payload) {
  const p = kakaoProps_();
  payload.client_id = p.getProperty('KAKAO_REST_KEY');
  const secret = p.getProperty('KAKAO_CLIENT_SECRET');
  if (secret) payload.client_secret = secret;
  const res = UrlFetchApp.fetch('https://kauth.kakao.com/oauth/token', {
    method: 'post', payload: payload, muteHttpExceptions: true
  });
  const data = JSON.parse(res.getContentText() || '{}');
  if (!data.access_token) throw new Error('카카오 토큰 오류: ' + res.getContentText());
  p.setProperty('KAKAO_ACCESS_TOKEN', data.access_token);
  p.setProperty('KAKAO_ACCESS_EXP', String(Date.now() + (Number(data.expires_in || 0) - 300) * 1000));
  if (data.refresh_token) p.setProperty('KAKAO_REFRESH_TOKEN', data.refresh_token); // 새로 받으면 교체
  return data.access_token;
}

/** 로그인 후 받은 코드를 토큰으로 바꿔 저장 (처음 한 번) */
function kakaoSaveCode(code) {
  kakaoTokenRequest_({ grant_type: 'authorization_code', redirect_uri: KAKAO_REDIRECT_URI, code: String(code).trim() });
  Logger.log('카카오 연결 완료');
}

function kakaoSetup() {
  kakaoSaveCode('여기에_코드_붙여넣기');
}

function kakaoAccessToken_() {
  const p = kakaoProps_();
  const tok = p.getProperty('KAKAO_ACCESS_TOKEN');
  const exp = Number(p.getProperty('KAKAO_ACCESS_EXP') || 0);
  if (tok && Date.now() < exp) return tok;
  const refresh = p.getProperty('KAKAO_REFRESH_TOKEN');
  if (!refresh) throw new Error('카카오 연결이 안 되어 있습니다. kakaoAuthUrl 부터 다시 해주세요.');
  return kakaoTokenRequest_({ grant_type: 'refresh_token', refresh_token: refresh });
}

/** 카톡 「나와의 채팅」으로 글 보내기. 실패해도 주문 처리는 막지 않음 */
function kakaoSendMe(text) {
  try {
    const tpl = {
      object_type: 'text',
      text: String(text).slice(0, 200),
      link: { web_url: 'https://haenamgonggu.kr/admin.html', mobile_web_url: 'https://haenamgonggu.kr/admin.html' },
      button_title: '관리자 열기'
    };
    const res = UrlFetchApp.fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
      method: 'post',
      headers: { Authorization: 'Bearer ' + kakaoAccessToken_() },
      payload: { template_object: JSON.stringify(tpl) },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) Logger.log('카톡 알림 실패: ' + res.getContentText());
  } catch (err) {
    Logger.log('카톡 알림 오류: ' + err);
  }
}

/** 새 주문 알림: 상품명 · 수량 · 주문자 이름만 */
function notifyOrderKakao(productName, qty, name) {
  kakaoSendMe('🛒 새 주문\n' + productName + ' × ' + qty + '\n주문자: ' + name);
}

function kakaoTest() {
  notifyOrderKakao('제주 노지감귤 5kg 로얄과(S·M·L)', 2, '테스트');
}
