/************************************************************
 * 2026-11-17 네이버(스마트스토어) 주문 — 관리자 「🟢 네이버 주문」
 * 스마트스토어 '발주(주문)확인/발송관리' 엑셀을 붙여넣어 '네이버주문' 시트에 저장합니다.
 * 주문관리 시트와는 따로 둡니다 (파트너 수당·현금영수증·입금확인 계산에 섞이지 않게).
 * 배송 달력은 이 시트를 함께 읽어 도착희망일에 표시합니다.
 * - adminNaverOrderImport : 상품주문번호 기준으로 새 주문 추가 / 기존 주문은 네이버 상태·발송기한만 갱신
 * - adminNaverOrderList   : 목록 (GET)
 * - adminNaverOrderUpdate : 우리 쪽 택배사·송장번호·배송상태·도착희망일·메모 수정
 ************************************************************/
const NAVER_ORDER_SHEET = '네이버주문';
const NAVER_ORDER_HEADERS = ['상품주문번호', '주문번호', '결제일', '상품코드', '상품명', '옵션정보', '수량',
  '수취인명', '수취인연락처', '우편번호', '배송지', '배송메세지', '도착희망일', '발송기한', '네이버주문상태',
  '택배사', '송장번호', '배송상태', '상품금액', '정산예정금액', '관리자메모', '등록일시', '수정일시'];
const NAVER_SHIP_STATUSES = ['배송대기', '송장등록', '배송중', '배송완료', '취소'];

function naverOrderSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(NAVER_ORDER_SHEET);
  const n = NAVER_ORDER_HEADERS.length;
  if (!sh) {
    sh = ss.insertSheet(NAVER_ORDER_SHEET);
    sh.getRange(1, 1, 1, n).setValues([NAVER_ORDER_HEADERS]).setFontWeight('bold').setBackground('#d9f2e3');
    sh.setFrozenRows(1);
    sh.getRange('A:B').setNumberFormat('@');
    sh.getRange('I:J').setNumberFormat('@');
    sh.getRange('Q:Q').setNumberFormat('@');
  } else {
    const actual = sh.getRange(1, 1, 1, n).getDisplayValues()[0];
    if (actual.some(function(v, i) { return safeText(v) !== NAVER_ORDER_HEADERS[i]; })) {
      throw new Error('네이버주문 시트의 열 제목이 예상 구조와 다릅니다. 기존 데이터를 보호하기 위해 작업을 중단합니다.');
    }
  }
  return sh;
}

function naverYmd_(v) {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const m = safeText(v).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}
function naverDateTime_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  return safeText(v);
}
function naverMoney_(v) {
  const n = Number(safeText(v).replace(/[^0-9.-]/g, ''));
  return isFinite(n) ? n : '';
}
// 옵션정보 "도착희망일: 11월 27일(금) 도착" → 2026-11-27 (결제일 기준 연도, 지난 달이면 다음 해)
function naverArrival_(option, wish, paidAt) {
  const w = naverYmd_(wish);
  if (w) return w;
  const s = safeText(option);
  let m = s.match(/(\d{4})\s*[-.\/년]\s*(\d{1,2})\s*[-.\/월]\s*(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || s.match(/(?:도착|희망)[^0-9]*(\d{1,2})\s*[\/.]\s*(\d{1,2})/);
  if (!m) return '';
  const paid = naverYmd_(paidAt) || naverYmd_(new Date());
  let y = Number(paid.slice(0, 4));
  const mon = Number(m[1]), day = Number(m[2]);
  if (mon < Number(paid.slice(5, 7)) - 1) y++;
  return y + '-' + ('0' + mon).slice(-2) + '-' + ('0' + day).slice(-2);
}

function naverOrderObject_(r, row) {
  return {
    row: row,
    productOrderNo: safeText(r[0]), orderNo: safeText(r[1]), paidAt: naverDateTime_(r[2]),
    productCode: safeText(r[3]), productName: safeText(r[4]), option: safeText(r[5]), qty: Number(r[6] || 0),
    name: safeText(r[7]), phone: safeText(r[8]), zip: safeText(r[9]), address: safeText(r[10]), memo: safeText(r[11]),
    arrivalDate: naverYmd_(r[12]), shipDeadline: naverDateTime_(r[13]), naverStatus: safeText(r[14]),
    courier: safeText(r[15]), trackingNumber: safeText(r[16]), shippingStatus: safeText(r[17]) || '배송대기',
    price: r[18] === '' ? '' : Number(r[18] || 0), settlement: r[19] === '' ? '' : Number(r[19] || 0),
    adminMemo: safeText(r[20]), createdAt: naverDateTime_(r[21]), updatedAt: naverDateTime_(r[22])
  };
}

function naverOrderRows_() {
  const sh = naverOrderSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, NAVER_ORDER_HEADERS.length).getValues()
    .map(function(r, i) { return naverOrderObject_(r, i + 2); })
    .filter(function(x) { return x.productOrderNo; });
}

function adminNaverOrderList_(params) {
  requireAdmin_(params.password || '');
  const rows = naverOrderRows_().map(function(x) { delete x.row; return x; });
  rows.sort(function(a, b) { return String(b.paidAt).localeCompare(String(a.paidAt)); });
  return { success: true, orders: rows };
}

function adminNaverOrderImport_(data) {
  requireAdmin_(data.password || '');
  let items = data.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { items = []; } }
  if (!Array.isArray(items) || !items.length) throw new Error('붙여넣은 주문이 없습니다.');
  if (items.length > 1000) throw new Error('한 번에 1000건까지 올릴 수 있습니다.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = naverOrderSheet_();
    const n = NAVER_ORDER_HEADERS.length;
    const last = sh.getLastRow();
    const existing = last >= 2 ? sh.getRange(2, 1, last - 1, n).getValues() : [];
    const index = {};
    existing.forEach(function(r, i) { const k = safeText(r[0]); if (k) index[k] = i; });
    const now = new Date();
    const newRows = [];
    let added = 0, updated = 0, skipped = 0, changedExisting = false;
    const seen = {};

    items.forEach(function(it) {
      const no = safeText(it.productOrderNo).replace(/[^0-9]/g, '');
      if (!no || seen[no]) { skipped++; return; }
      seen[no] = true;
      const status = safeText(it.naverStatus);
      const arrival = naverArrival_(it.option, it.wishDate, it.paidAt);
      const naverCourier = safeText(it.courier), naverTracking = safeText(it.trackingNumber);
      if (index[no] !== undefined) {
        const r = existing[index[no]];
        r[13] = safeText(it.shipDeadline) || r[13];
        r[14] = status || r[14];
        if (!safeText(r[12]) && arrival) r[12] = arrival;
        if (naverTracking && !safeText(r[16])) { r[15] = naverCourier || r[15]; r[16] = naverTracking; if (!safeText(r[17]) || safeText(r[17]) === '배송대기') r[17] = '송장등록'; }
        if (/취소|반품/.test(status)) r[17] = '취소';
        else if (/배송완료|구매확정/.test(status)) r[17] = '배송완료';
        else if (/배송중/.test(status) && safeText(r[17]) !== '배송완료') r[17] = '배송중';
        r[22] = now;
        changedExisting = true; updated++;
        return;
      }
      let ship = naverTracking ? '송장등록' : '배송대기';
      if (/취소|반품/.test(status)) ship = '취소';
      else if (/배송완료|구매확정/.test(status)) ship = '배송완료';
      else if (/배송중/.test(status)) ship = '배송중';
      newRows.push([no, safeText(it.orderNo).replace(/[^0-9]/g, ''), safeText(it.paidAt), safeText(it.productCode),
        safeText(it.productName), safeText(it.option), Number(it.qty || 1), safeText(it.name), safeText(it.phone),
        safeText(it.zip), safeText(it.address), safeText(it.memo), arrival, safeText(it.shipDeadline), status,
        naverCourier, naverTracking, ship, naverMoney_(it.price), naverMoney_(it.settlement), '', now, now]);
      added++;
    });

    if (changedExisting) sh.getRange(2, 1, existing.length, n).setValues(existing);
    if (newRows.length) {
      const row = Math.max(last, 1) + 1;
      const rng = sh.getRange(row, 1, newRows.length, n);
      rng.setNumberFormats(newRows.map(function() {
        return NAVER_ORDER_HEADERS.map(function(h, i) { return (i <= 1 || i === 8 || i === 9 || i === 16) ? '@' : 'General'; });
      }));
      rng.setValues(newRows);
    }
    SpreadsheetApp.flush();
    return { success: true, added: added, updated: updated, skipped: skipped,
      message: '네이버 주문 새로 ' + added + '건, 상태 갱신 ' + updated + '건' + (skipped ? ', 건너뜀 ' + skipped + '건' : '') + '.' };
  } finally {
    lock.releaseLock();
  }
}

function adminNaverOrderUpdate_(data) {
  requireAdmin_(data.password || '');
  let items = data.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { items = []; } }
  if (!Array.isArray(items)) items = [data];
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = naverOrderSheet_();
    const rows = naverOrderRows_();
    const byNo = {};
    rows.forEach(function(x) { byNo[x.productOrderNo] = x; });
    const now = new Date();
    let updated = 0; const notFound = [];
    items.forEach(function(it) {
      const no = safeText(it.productOrderNo);
      const x = byNo[no];
      if (!x) { notFound.push(no); return; }
      const st = safeText(it.shippingStatus);
      const arrival = it.arrivalDate === undefined ? x.arrivalDate : naverYmd_(it.arrivalDate);
      const vals = [[
        arrival,
        x.shipDeadline, x.naverStatus,
        it.courier === undefined ? x.courier : safeText(it.courier),
        it.trackingNumber === undefined ? x.trackingNumber : safeText(it.trackingNumber),
        NAVER_SHIP_STATUSES.indexOf(st) >= 0 ? st : x.shippingStatus
      ]];
      sh.getRange(x.row, 13, 1, 6).setValues(vals);
      if (it.adminMemo !== undefined) sh.getRange(x.row, 21).setValue(safeText(it.adminMemo).slice(0, 300));
      sh.getRange(x.row, 23).setValue(now);
      updated++;
    });
    SpreadsheetApp.flush();
    return { success: true, updated: updated, notFound: notFound, message: '네이버 주문 ' + updated + '건 저장했습니다.' };
  } finally {
    lock.releaseLock();
  }
}
