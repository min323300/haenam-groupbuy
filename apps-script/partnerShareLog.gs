/**
 * 파트너센터 공유 기록 (partner.html → action: 'partnerShareLog')
 *
 * 붙이는 방법
 * 1) 구글시트 '공유기록' 탭은 이미 만들어져 있습니다.
 *    (열: 공유일시 | 파트너코드 | 파트너명 | 상품코드 | 상품명 | 상품수 | 같은상품 회차)
 * 2) 앱스스크립트 편집기에 이 함수를 붙여넣습니다.
 * 3) doPost(e) 안에서 action 별로 나누는 곳에 아래 한 줄을 추가합니다.
 *      if (data.action === 'partnerShareLog') return partnerShareLog_(data);
 * 4) PARTNER_FROM_TOKEN_ 안의 내용을, 지금 partnerDashboard 에서 토큰으로
 *    파트너를 찾는 함수로 바꿔 줍니다. (그 함수 이름에 맞춰 한 줄만 고치면 됩니다)
 * 5) 배포 → 배포 관리 → 기존 웹앱 '수정' → 새 버전으로 배포 (URL이 바뀌지 않게)
 *
 * 친구 이름은 보내지 않습니다. 파트너 휴대폰에만 저장됩니다.
 */
function PARTNER_FROM_TOKEN_(token) {
  // 예시) return getPartnerBySession_(token);   ← 기존 함수 이름으로 바꾸세요
  // 반환값: { partnerCode: 'PT-0019', name: '배상민' } 형태, 없으면 null
  throw new Error('PARTNER_FROM_TOKEN_ 을 기존 토큰 확인 함수로 바꿔 주세요.');
}

function partnerShareLog_(data) {
  const out = obj => ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  try {
    const partner = PARTNER_FROM_TOKEN_(String(data.token || ''));
    if (!partner) return out({ success: false, message: '로그인이 만료되었습니다.' });
    const sh = SpreadsheetApp.getActive().getSheetByName('공유기록');
    if (!sh) return out({ success: false, message: '공유기록 탭이 없습니다.' });
    sh.appendRow([
      new Date(),
      partner.partnerCode || '',
      partner.name || '',
      String(data.productCodes || '').slice(0, 300),
      String(data.productNames || '').slice(0, 300),
      Number(data.productCount || 0),
      Number(data.round || 0)
    ]);
    return out({ success: true });
  } catch (e) {
    return out({ success: false, message: String(e && e.message || e) });
  }
}
