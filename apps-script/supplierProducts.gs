/************************************************************
 * 2026-11-17 공급처별 상품·입고가 관리 (관리자 ⑦ 매입관리 「🏭 공급처별 상품·입고가」)
 * - adminSupplierUpdate        : 공급처 정보 수정 (이름 바꾸면 공급단가·매입관리·벤더수수료의 공급처명도 같이 바꿈)
 * - adminSupplierProductsSave  : 한 공급처의 여러 상품 입고가를 한 번에 등록 (최대 500개)
 *                                같은 가격이면 건너뜀, 바뀌면 새 줄 추가 + 직전 단가 자동 마감 (이력 보존)
 * - adminSupplyPriceEnd        : 이 공급처에서 이 상품 공급 종료 (적용종료일 입력)
 * 시트 구조는 기존 '공급단가' 그대로 사용합니다.
 ************************************************************/
function supplierPhoneFmt_(digits) {
  if (!digits) return '';
  return digits.indexOf('02') === 0
    ? digits.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3')
    : digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
}

function supplierRenameInSheet_(ss, sheetName, col, oldName, newName) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return 0;
  const rng = sh.getRange(2, col, sh.getLastRow() - 1, 1);
  const vals = rng.getValues();
  const key = supplierNameKey_(oldName);
  let n = 0;
  vals.forEach(function(r) { if (key && supplierNameKey_(r[0]) === key) { r[0] = newName; n++; } });
  if (n) rng.setValues(vals);
  return n;
}

function adminSupplierUpdate_(data) {
  requireAdmin_(data.password || '');
  const code = safeText(data.supplierCode);
  const name = safeText(data.supplierName).replace(/\s+/g, ' ');
  const type = safeText(data.supplierType);
  const owner = safeText(data.ownerName);
  const phoneDigits = safeText(data.phone).replace(/[^0-9]/g, '');
  const bizDigits = safeText(data.businessNumber).replace(/[^0-9]/g, '');

  if (!code) throw new Error('공급처코드가 없습니다.');
  if (!name) throw new Error('공급처명을 입력해 주세요.');
  if (name.length > 60) throw new Error('공급처명은 60자 이내로 입력해 주세요.');
  if (SUPPLIER_MASTER_TYPES.indexOf(type) === -1) throw new Error('공급자구분을 선택해 주세요.');
  if (owner.length > 30) throw new Error('대표자명은 30자 이내로 입력해 주세요.');
  if (phoneDigits && !/^0\d{8,10}$/.test(phoneDigits)) throw new Error('연락처를 정확히 입력해 주세요. (예: 010-1234-5678)');
  if (bizDigits && bizDigits.length !== 10) throw new Error('사업자등록번호는 숫자 10자리입니다. (예: 123-45-67890)');
  const phone = supplierPhoneFmt_(phoneDigits);
  const businessNumber = bizDigits ? bizDigits.replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3') : '';

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SUPPLIER_MASTER_SHEET);
    if (!sh || sh.getLastRow() < 2) throw new Error('공급처관리 시트가 없습니다.');
    const header = sh.getRange(1, 1, 1, SUPPLIER_MASTER_HEADERS.length).getDisplayValues()[0];
    if (header.some(function(v, i) { return safeText(v) !== SUPPLIER_MASTER_HEADERS[i]; })) {
      throw new Error('공급처관리 시트의 열 제목이 예상 구조와 다릅니다. 기존 데이터를 보호하기 위해 저장을 중단합니다.');
    }
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getDisplayValues();
    const idx = rows.findIndex(function(r) { return safeText(r[0]) === code; });
    if (idx < 0) throw new Error('공급처(' + code + ')를 찾을 수 없습니다.');
    const oldName = safeText(rows[idx][1]);
    const key = supplierNameKey_(name);
    rows.forEach(function(r, i) {
      if (i !== idx && supplierNameKey_(r[1]) === key) throw new Error('"' + safeText(r[1]) + '" 공급처가 이미 있습니다. 다른 이름으로 해 주세요.');
    });
    const range = sh.getRange(idx + 2, 1, 1, 6);
    range.setNumberFormats([['@', '@', '@', '@', '@', '@']]);
    range.setValues([[code, name, type, businessNumber, owner, phone]]);

    let renamed = '';
    if (supplierNameKey_(oldName) !== key) {
      const a = supplierRenameInSheet_(ss, SUPPLY_PRICE_SHEET, 4, oldName, name);
      const b = supplierRenameInSheet_(ss, '매입관리', 5, oldName, name);
      const c = supplierRenameInSheet_(ss, '벤더수수료', 4, oldName, name);
      renamed = ' 이름 변경을 공급단가 ' + a + '줄, 매입관리 ' + b + '줄, 벤더수수료 ' + c + '줄에 함께 반영했습니다.';
    }
    SpreadsheetApp.flush();
    return { success: true, message: '공급처 "' + name + '" 정보를 저장했습니다.' + renamed,
      supplier: { supplierCode: code, supplierName: name, supplierType: type, ownerName: owner, phone: phone, businessNumber: businessNumber } };
  } finally {
    lock.releaseLock();
  }
}

function adminSupplierProductsSave_(data) {
  requireAdmin_(data.password || '');
  const supplierIn = safeText(data.supplierName).replace(/\s+/g, ' ');
  if (!supplierIn) throw new Error('공급처를 선택해 주세요.');
  let items = data.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { items = []; } }
  if (!Array.isArray(items) || !items.length) throw new Error('저장할 상품이 없습니다.');
  if (items.length > 500) throw new Error('한 번에 500개까지 저장할 수 있습니다. 나눠서 저장해 주세요.');
  const today = supplyPriceYmd_(new Date());
  const defaultStart = supplyPriceYmd_(data.startDate) || today;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const supSheet = ss.getSheetByName(SUPPLIER_MASTER_SHEET);
  const supRow = supSheet && supSheet.getLastRow() >= 2
    ? supSheet.getRange(2, 1, supSheet.getLastRow() - 1, 2).getValues()
        .find(function(r) { return supplierNameKey_(r[1]) === supplierNameKey_(supplierIn); })
    : null;
  if (!supRow) throw new Error('공급처관리에서 "' + supplierIn + '" 공급처를 찾을 수 없습니다.');
  const supplierSaved = safeText(supRow[1]);
  const key = supplierNameKey_(supplierSaved);

  const productSheet = ss.getSheetByName('상품세부정보');
  if (!productSheet || productSheet.getLastRow() < 2) throw new Error('상품세부정보 시트가 없습니다.');
  const productMap = {};
  productSheet.getRange(2, 1, productSheet.getLastRow() - 1, 7).getValues().forEach(function(r) {
    const c = safeText(r[0]); if (c) productMap[c] = { name: safeText(r[1]), ship: Math.max(0, Number(r[6] || 0)) };
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = supplyPriceSheet_();
    const header = sh.getRange(1, 1, 1, SUPPLY_PRICE_HEADERS.length).getDisplayValues()[0];
    if (header.some(function(v, i) { return safeText(v) !== SUPPLY_PRICE_HEADERS[i]; })) {
      throw new Error('공급단가 시트의 열 제목이 예상 구조와 다릅니다. 기존 데이터를 보호하기 위해 저장을 중단합니다.');
    }
    const all = supplyPriceRows_();
    const lastRow = sh.getLastRow();
    const endCol = lastRow >= 2 ? sh.getRange(2, 7, lastRow - 1, 1).getValues() : [];
    let endChanged = false;
    const newRows = [], errors = [], seen = {};
    let saved = 0, unchanged = 0;
    const now = new Date();
    const stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMddHHmmss');

    items.forEach(function(it, n) {
      const code = safeText(it && it.productCode);
      const label = (productMap[code] && productMap[code].name) || code || ('#' + (n + 1));
      try {
        if (!code || !productMap[code]) throw new Error('상품세부정보에 없는 상품입니다.');
        if (seen[code]) throw new Error('같은 상품이 두 번 들어 있습니다.');
        seen[code] = true;
        const unitPrice = Math.round(Number(it.unitPrice));
        if (!isFinite(unitPrice) || unitPrice <= 0) throw new Error('입고가를 1원 이상 입력해 주세요.');
        const shipIn = safeText(it.shippingPerBox);
        const ship = shipIn === '' ? null : Math.round(Number(shipIn));
        if (ship !== null && (!isFinite(ship) || ship < 0)) throw new Error('택배비를 확인해 주세요.');
        const start = supplyPriceYmd_(it.startDate) || defaultStart;

        const same = all.filter(function(x) { return x.productCode === code && supplierNameKey_(x.supplierName) === key; });
        const later = same.filter(function(x) { return x.startDate >= start; }).sort(supplyPriceSort_);
        const cur = same.filter(function(x) { return x.startDate <= start && (!x.endDate || x.endDate >= start); }).sort(supplyPriceSort_)[0];
        const latest = later[0] || cur;
        if (latest && latest.unitPrice === unitPrice && (ship === null || latest.shippingPerBox === ship) && !latest.endDate) { unchanged++; return; }
        if (later.length) throw new Error(later[0].startDate + ' 시작 단가가 이미 있습니다. 적용 시작일을 그 다음 날로 해 주세요.');

        const shipVal = ship !== null ? ship : (cur ? cur.shippingPerBox : productMap[code].ship);
        const reasonIn = safeText(it.reason);
        const reason = cur ? (SUPPLY_PRICE_REASONS.indexOf(reasonIn) >= 0 && reasonIn !== '최초입점' ? reasonIn : '시세변동') : '최초입점';
        const prevEnd = supplyPriceAddDays_(start, -1);
        same.forEach(function(x) {
          if (!x.endDate || x.endDate >= start) { endCol[x.row - 2][0] = supplyPriceDate_(prevEnd); endChanged = true; }
        });
        const checkDays = cur && cur.checkDays !== '' ? cur.checkDays : '';
        const id = 'SP-' + stamp + '-' + ('00' + (n + 1)).slice(-3);
        newRows.push([id, code, productMap[code].name, supplierSaved, safeText(it.round).slice(0, 20),
          supplyPriceDate_(start), '', unitPrice, shipVal, '', reason, checkDays,
          safeText(it.memo).slice(0, 200) || '공급처별 상품 등록', now]);
        saved++;
      } catch (err) {
        errors.push({ productCode: code, productName: label, message: err.message });
      }
    });

    if (endChanged) sh.getRange(2, 7, endCol.length, 1).setValues(endCol);
    if (newRows.length) {
      const row = Math.max(lastRow, 1) + 1;
      sh.getRange(row, 1, newRows.length, SUPPLY_PRICE_HEADERS.length).setValues(newRows);
      sh.getRange(row, 6, newRows.length, 2).setNumberFormat('yyyy-mm-dd');
    }
    SpreadsheetApp.flush();
    return {
      success: true, saved: saved, unchanged: unchanged, errors: errors,
      message: supplierSaved + ': 입고가 ' + saved + '개 저장' + (unchanged ? ', 변경 없음 ' + unchanged + '개' : '') + (errors.length ? ', 확인 필요 ' + errors.length + '개' : '') + '.'
    };
  } finally {
    lock.releaseLock();
  }
}

function adminSupplyPriceEnd_(data) {
  requireAdmin_(data.password || '');
  const code = safeText(data.productCode);
  const key = supplierNameKey_(data.supplierName);
  const endDate = supplyPriceYmd_(data.endDate) || supplyPriceYmd_(new Date());
  if (!code || !key) throw new Error('상품과 공급처를 확인해 주세요.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = supplyPriceSheet_();
    const hits = supplyPriceRows_().filter(function(x) {
      return x.productCode === code && supplierNameKey_(x.supplierName) === key && (!x.endDate || x.endDate > endDate);
    });
    if (!hits.length) throw new Error('종료할 입고가가 없습니다.');
    if (hits.some(function(x) { return x.startDate > endDate; })) throw new Error(endDate + ' 이후에 시작하는 단가가 있습니다. 그 단가를 먼저 삭제해 주세요.');
    hits.forEach(function(x) { sh.getRange(x.row, 7).setValue(supplyPriceDate_(endDate)); });
    SpreadsheetApp.flush();
    return { success: true, message: (hits[0].productName || code) + ' 공급을 ' + endDate + '까지로 종료했습니다.' };
  } finally {
    lock.releaseLock();
  }
}
