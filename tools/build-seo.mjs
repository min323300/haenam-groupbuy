// 해남공구마켓 검색 노출용 상품 페이지 만들기 (2026-11-19)
// - 구글시트(앱스스크립트)에서 상품 목록을 받아 /p/상품코드.html 을 상품(옵션 묶음)마다 만듭니다.
// - /p/index.html(전체 상품 목록), sitemap.xml 을 새로 쓰고, 홈 index.html 아래쪽 상품 링크 목록을 바꿉니다.
// - 깃허브 액션(.github/workflows/seo-pages.yml)이 매일 새벽 자동으로 실행합니다.
// 실행: node tools/build-seo.mjs            (인터넷에서 상품 받기)
//       node tools/build-seo.mjs data.json  (저장한 상품 목록으로 시험)
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://haenamgonggu.kr';
const API_URL = 'https://script.google.com/macros/s/AKfycbz9-pk6kkPk01Lh11agNKxeV1Gjo_kzAPYOXyJ9kXUVY7r8t3ptrLurCjOwdTf31f00ug/exec';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'p');
const UTM = 'utm_source=productpage&utm_medium=organic&utm_campaign=seo';

const s = v => String(v == null ? '' : v);
const e = v => s(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const money = v => Number(v || 0).toLocaleString('ko-KR') + '원';
const dateOf = v => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };
const ymd = d => d.toISOString().slice(0, 10);

// 사이트(index.html)와 같은 규칙
const BLOCK_MARKERS = { cardDesc: '[[카드설명]]', priceNote: '[[가격옆문구]]', fold: '[[접기]]', group: '[[묶음]]', optionLabel: '[[옵션명]]', displayOrder: '[[순서]]', video: '[[움짤]]', npay: '[[네이버페이]]' };
function blocksOf(p) {
  let raw = p.detailBlocks;
  if (raw == null || raw === '') raw = p.detailPage;
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string' && raw.trim()) { try { const a = JSON.parse(raw); if (Array.isArray(a)) arr = a; } catch (_) { } }
  return arr.map(b => {
    if (b && s(b.type).toLowerCase() === 'text') {
      const v = s(b.value || b.text || b.content);
      for (const [type, mk] of Object.entries(BLOCK_MARKERS)) if (v.startsWith(mk)) return { type, value: v.slice(mk.length).trim() };
    }
    return b || {};
  });
}
const meta = (p, type) => { const b = blocksOf(p).find(x => s(x.type).toLowerCase() === type.toLowerCase()); return b ? s(b.value).trim() : ''; };
function stateOf(p, now) {
  const start = dateOf(p.startAt), end = dateOf(p.endAt);
  if (['종료', '판매종료', '판매중단'].includes(s(p.saleStatus)) || (end && end.getTime() <= now)) return '종료';
  if (s(p.saleStatus) === '준비중' || (start && start.getTime() > now)) return '준비중';
  return '판매중';
}
function imageUrl(url, size) {
  const u = s(url).trim(); if (!u) return '';
  let m = u.match(/[?&]id=([^&]+)/) || u.match(/\/file\/d\/([^/]+)/);
  return m ? 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(m[1]) + '=' + (size || 'w1200') : u;
}
const detailText = t => e(t).replace(/\*\*([^*\n][^*]*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
const plain = t => s(t).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const cut = (t, n) => { const x = plain(t); return x.length > n ? x.slice(0, n - 1) + '…' : x; };

async function getJson(action) {
  const r = await fetch(API_URL + '?action=' + action + '&t=' + Date.now(), { redirect: 'follow' });
  if (!r.ok) throw new Error(action + ' HTTP ' + r.status);
  return r.json();
}

// ---------- 페이지 조각 ----------
const CSS = `*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#1f2a24;background:#f6f7f2;line-height:1.6}
a{color:inherit}.top{background:#176c46;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px}.top a{text-decoration:none;display:flex;align-items:center;gap:8px;font-weight:800;font-size:18px}.top img{width:32px;height:32px;border-radius:6px}
.wrap{max-width:720px;margin:0 auto;padding:16px}.crumb{font-size:13px;color:#6b766f;margin:4px 0 12px}.crumb a{text-decoration:none}
.hero{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:14px;background:#e6ebe3;display:block}
h1{font-size:24px;margin:16px 0 6px;line-height:1.35}.sub{color:#4b5650;margin:0 0 12px}
.badge{display:inline-block;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;background:#e8f3ec;color:#176c46;margin-right:6px}.badge.end{background:#eee;color:#777}.badge.ready{background:#fff3e0;color:#b45309}
.price{font-size:28px;font-weight:900;color:#c2410c}.price small{font-size:14px;color:#6b766f;font-weight:600;margin-left:6px}.normal{color:#9aa39d;text-decoration:line-through;font-size:15px;margin-left:6px}
table.opt{width:100%;border-collapse:collapse;margin:12px 0;background:#fff;border-radius:10px;overflow:hidden}table.opt td{padding:10px 12px;border-bottom:1px solid #eef0ea}table.opt td:last-child{text-align:right;font-weight:800}
dl.info{display:grid;grid-template-columns:96px 1fr;gap:6px 10px;background:#fff;border-radius:12px;padding:14px;margin:14px 0;font-size:15px}dl.info dt{color:#6b766f}dl.info dd{margin:0}
.cta{display:block;text-align:center;background:#176c46;color:#fff;text-decoration:none;font-weight:800;font-size:18px;padding:15px;border-radius:12px;margin:16px 0}.cta.off{background:#9aa39d}
.detail{background:#fff;border-radius:14px;padding:16px;margin-top:16px}.detail img{width:100%;height:auto;display:block;border-radius:10px;margin:12px 0}.detail .em{background:#fff7ed;border-left:4px solid #c2410c;padding:12px;border-radius:8px;font-weight:700;margin:12px 0}
.more h2{font-size:18px;margin:26px 0 10px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.card{background:#fff;border-radius:12px;overflow:hidden;text-decoration:none;display:block}.card img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;background:#e6ebe3}.card b{display:block;padding:8px 10px 0;font-size:15px}.card span{display:block;padding:0 10px 10px;color:#c2410c;font-weight:800}.card i{display:block;padding:0 10px;color:#6b766f;font-style:normal;font-size:13px}
footer{background:#203028;color:#dbe4df;text-align:center;padding:26px 16px;font-size:13px;margin-top:30px;line-height:1.8}footer a{color:#fff}`;

function head({ title, desc, url, image, noindex, jsonld }) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${e(title)}</title>
<meta name="description" content="${e(desc)}">
${noindex ? '<meta name="robots" content="noindex,follow">\n' : ''}<link rel="canonical" href="${e(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="해남공구마켓">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(desc)}">
<meta property="og:url" content="${e(url)}">
<meta property="og:image" content="${e(image || SITE + '/share.png?v=2')}">
<link rel="icon" type="image/png" href="/favicon.png?v=2">
<meta name="theme-color" content="#176c46">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>\n` : ''}<style>${CSS}</style>
</head>
<body>
<header class="top"><a href="/"><img src="/logo-seal.png" alt="">해남공구마켓</a></header>
`;
}
function foot(biz) {
  return `<footer>
  <div>해남공구마켓 · 전국 생산자와 함께하는 농·수·축산물 공동구매</div>
  ${biz ? `<div style="margin-top:8px">${biz}</div>` : ''}
  <div style="margin-top:8px"><a href="/">홈으로</a> · <a href="/p/">전체 상품 보기</a></div>
</footer>
</body>
</html>
`;
}

function bizLine(st) {
  if (!st) return '';
  const parts = [];
  if (st.businessName) parts.push('상호: ' + e(st.businessName));
  if (st.representativeName) parts.push('대표자: ' + e(st.representativeName));
  if (st.businessNumber) parts.push('사업자등록번호: ' + e(st.businessNumber));
  if (st.mailOrderNumber) parts.push('통신판매업신고번호: ' + e(st.mailOrderNumber));
  if (st.businessAddress) parts.push('사업장 주소: ' + e(st.businessAddress));
  if (st.customerServicePhone) parts.push('고객센터: ' + e(st.customerServicePhone));
  parts.push('이메일: hypo3300@naver.com');
  return parts.join(' · ');
}

function detailHtml(p) {
  const out = [];
  for (const b of blocksOf(p)) {
    const t = s(b.type).toLowerCase();
    if (t === 'image') {
      const src = imageUrl(b.imageUrl || b.url || b.src || b.value || b.image, 'w1000');
      if (src) out.push(`<img src="${e(src)}" alt="${e(p.productName)} 상세 사진" loading="lazy" decoding="async">`);
    } else if (t === 'text') {
      const v = s(b.text || b.content || b.value); if (v) out.push(`<p>${detailText(v)}</p>`);
    } else if (t === 'price' || t === 'emphasis' || t === 'highlight') {
      const v = s(b.text || b.content || b.value); if (v) out.push(`<div class="em">${detailText(v)}</div>`);
    }
  }
  return out.join('\n');
}

function cardHtml(u) {
  return `<a class="card" href="/p/${e(u.slug)}.html">${u.img ? `<img src="${e(imageUrl(u.leader.image, 'w400'))}" alt="${e(u.name)}" loading="lazy">` : ''}<b>${e(u.name)}</b><i>${e(u.state === '판매중' ? '공구 진행중' : u.state === '준비중' ? '공구 준비중' : '공구 마감')}</i><span>${u.min > 0 ? money(u.min) + (u.items.length > 1 ? '~' : '') : ''}</span></a>`;
}

function productPage(u, others, biz) {
  const p = u.leader, url = `${SITE}/p/${u.slug}.html`;
  const cardDesc = meta(p, 'cardDesc') || s(p.description);
  const priceNote = meta(p, 'priceNote');
  const end = dateOf(p.endAt);
  const endTxt = end ? `${end.getMonth() + 1}월 ${end.getDate()}일 마감` : '';
  const title = `${u.name} 공동구매 ${u.min > 0 ? money(u.min) + (u.items.length > 1 ? '~' : '') : ''} | 해남공구마켓`.replace(/\s+\|/, ' |');
  const desc = cut([cardDesc, u.min > 0 ? money(u.min) + (u.items.length > 1 ? '부터' : '') : '', priceNote, endTxt, '산지에서 바로 보내는 해남공구마켓 공동구매'].filter(Boolean).join(' · '), 150);
  const hero = imageUrl(p.image, 'w1200');
  const avail = u.state === '판매중' ? 'https://schema.org/InStock' : u.state === '준비중' ? 'https://schema.org/PreOrder' : 'https://schema.org/SoldOut';
  const offers = u.items.length > 1
    ? { '@type': 'AggregateOffer', priceCurrency: 'KRW', lowPrice: u.min, highPrice: u.max, offerCount: u.items.length, availability: avail, url }
    : { '@type': 'Offer', priceCurrency: 'KRW', price: u.min, availability: avail, url, ...(end ? { priceValidUntil: ymd(end) } : {}) };
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product', name: u.name, description: plain(cardDesc) || u.name,
    ...(hero ? { image: [hero] } : {}), brand: { '@type': 'Brand', name: '해남공구마켓' }, sku: s(p.productCode),
    ...(u.min > 0 ? { offers: { ...offers, seller: { '@type': 'Organization', name: '해남공구마켓' } } } : {})
  };
  const orderUrl = `/?product=${encodeURIComponent(s(p.productCode))}&${UTM}`;
  const dates = Array.isArray(p.deliveryDates) ? p.deliveryDates.map(dateOf).filter(d => d && d.getTime() > Date.now()).slice(0, 6) : [];
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const badge = u.state === '판매중' ? '<span class="badge">공구 진행중</span>' : u.state === '준비중' ? '<span class="badge ready">공구 준비중</span>' : '<span class="badge end">공구 마감</span>';
  const normal = Number(p.normalPrice) > Number(p.salePrice) && u.items.length === 1 ? `<span class="normal">${money(p.normalPrice)}</span>` : '';
  return head({ title, desc, url, image: hero, noindex: !u.index, jsonld }) + `<main class="wrap">
<div class="crumb"><a href="/">해남공구마켓</a> › <a href="/p/">전체 상품</a> › ${e(u.name)}</div>
${hero ? `<img class="hero" src="${e(hero)}" alt="${e(u.name)}">` : ''}
<h1>${e(u.name)}</h1>
<p class="sub">${badge}${e(plain(cardDesc))}</p>
${u.min > 0 ? `<div class="price">${money(u.min)}${u.items.length > 1 ? '~' : ''}${normal}${priceNote ? `<small>${e(priceNote)}</small>` : ''}</div>` : ''}
${u.items.length > 1 ? `<table class="opt">${u.items.map(x => `<tr><td>${e(meta(x, 'optionLabel') || x.productName)}</td><td>${money(x.salePrice)}</td></tr>`).join('')}</table>` : ''}
<dl class="info">
${endTxt ? `<dt>주문 마감</dt><dd>${e(endTxt)}</dd>` : ''}
${dates.length ? `<dt>받는 날</dt><dd>${dates.map(d => `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`).join(', ')}${p.deliveryDates.length > dates.length ? ' 등' : ''} 중 선택</dd>` : ''}
<dt>판매</dt><dd>해남공구마켓 공동구매</dd>
</dl>
${u.state === '판매중' ? `<a class="cta" href="${e(orderUrl)}">공구 참여하기 (주문하기)</a>` : `<a class="cta off" href="/">${u.state === '준비중' ? '공구 준비중입니다 · 다른 상품 보기' : '공구가 마감되었습니다 · 진행중인 상품 보기'}</a>`}
<section class="detail">
<h2 style="font-size:18px;margin:0 0 8px">상품 자세히 보기</h2>
${detailHtml(p) || `<p>${e(plain(s(p.description)))}</p>`}
</section>
${u.state === '판매중' ? `<a class="cta" href="${e(orderUrl)}">공구 참여하기 (주문하기)</a>` : ''}
${others.length ? `<section class="more"><h2>함께 진행중인 공동구매</h2><div class="grid">${others.map(cardHtml).join('')}</div></section>` : ''}
</main>
` + foot(biz);
}

function listPage(units, biz) {
  const live = units.filter(u => u.state !== '종료');
  const ended = units.filter(u => u.state === '종료');
  const names = live.map(u => u.name).slice(0, 8).join(', ');
  return head({ title: '전체 공동구매 상품 | 해남공구마켓', desc: cut('해남공구마켓에서 진행중인 공동구매 상품 모음: ' + names, 150), url: SITE + '/p/' }) + `<main class="wrap">
<div class="crumb"><a href="/">해남공구마켓</a> › 전체 상품</div>
<h1>해남공구마켓 공동구매 상품</h1>
<p class="sub">산지에서 바로 보내는 농·수·축산물 공동구매입니다. 상품을 누르면 자세한 내용과 주문 방법을 볼 수 있습니다.</p>
<div class="grid">${live.map(cardHtml).join('')}</div>
${ended.length ? `<section class="more"><h2>마감된 공동구매</h2><div class="grid">${ended.map(cardHtml).join('')}</div></section>` : ''}
</main>
` + foot(biz);
}

// ---------- 실행 ----------
const now = Date.now();
let products, settings = null;
if (process.argv[2]) {
  const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  products = Array.isArray(d) ? d : d.products;
} else {
  const d = await getJson('products');
  if (d.success === false || !Array.isArray(d.products)) throw new Error('상품 목록을 받지 못했습니다: ' + (d.message || ''));
  products = d.products;
  try { const st = await getJson('settings'); settings = st.settings || st; } catch (err) { console.warn('사업자정보 생략:', err.message); }
}
if (!products.length) throw new Error('상품이 0개입니다. 기존 페이지를 지키기 위해 중단합니다.');
const biz = bizLine(settings);

// 옵션 묶음(같은 묶음 이름 + 같은 상태)을 페이지 하나로
const byKey = new Map();
for (const p of products) {
  if (!s(p.productCode)) continue;
  const g = meta(p, 'group'), st = stateOf(p, now);
  const key = g ? 'g:' + g + ':' + st : 'c:' + p.productCode;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(p);
}
const rank = { '판매중': 0, '준비중': 1, '종료': 2 };
const units = [...byKey.values()].map(items => {
  items.sort((a, b) => Number(a.salePrice || 0) - Number(b.salePrice || 0));
  const leader = items[0];
  const prices = items.map(x => Number(x.salePrice || 0)).filter(n => n > 0);
  const order = Number(meta(leader, 'displayOrder')) || 9999;
  return {
    items, leader, state: stateOf(leader, now), order,
    name: meta(leader, 'group') || s(leader.productName).trim(),
    slug: items.map(x => s(x.productCode)).sort()[0], // 가장 먼저 등록한 상품코드 = 바뀌지 않는 주소
    min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0,
    img: !!s(leader.image).trim()
  };
}).map(u => {
  u.index = u.state === '판매중' || (u.state === '준비중' && !!plain(meta(u.leader, 'cardDesc') || u.leader.description));
  return u;
}).sort((a, b) => rank[a.state] - rank[b.state] || a.order - b.order);

fs.mkdirSync(OUT, { recursive: true });
const keep = new Set(['index.html']);
for (const u of units) {
  const others = units.filter(x => x !== u && x.state === '판매중').slice(0, 6);
  fs.writeFileSync(path.join(OUT, u.slug + '.html'), productPage(u, others, biz));
  keep.add(u.slug + '.html');
}
fs.writeFileSync(path.join(OUT, 'index.html'), listPage(units, biz));
// 시트에서 지워진 상품 페이지만 정리 (마감된 상품은 noindex 로 남겨 링크가 끊기지 않게)
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.html') && !keep.has(f)) fs.unlinkSync(path.join(OUT, f));

// sitemap.xml: 홈 + 전체목록 + 진행/준비중 상품
const today = ymd(new Date());
const urls = [[SITE + '/', '1.0', 'daily'], [SITE + '/p/', '0.9', 'daily'],
...units.filter(u => u.index).map(u => [`${SITE}/p/${u.slug}.html`, u.state === '판매중' ? '0.8' : '0.5', 'daily'])];
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([loc, pr, cf]) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${cf}</changefreq>
    <priority>${pr}</priority>
  </url>`).join('\n')}
</urlset>
`);

// 홈 index.html 아래쪽: 로봇이 바로 읽을 수 있는 상품 링크 목록 (표시 사이 내용만 바꿈)
const idxPath = path.join(ROOT, 'index.html');
const idx = fs.readFileSync(idxPath, 'utf8');
const A = '<!--SEO-LIST-START-->', B = '<!--SEO-LIST-END-->';
const live = units.filter(u => u.index);
const block = `${A}<nav class="seo-list" aria-label="공동구매 상품"><b>공동구매 상품</b> ${live.map(u => `<a href="/p/${e(u.slug)}.html">${e(u.name)}</a>`).join(' · ')} · <a href="/p/">전체 상품 보기</a></nav>${B}`;
if (idx.includes(A) && idx.includes(B)) {
  const next = idx.slice(0, idx.indexOf(A)) + block + idx.slice(idx.indexOf(B) + B.length);
  if (next !== idx) fs.writeFileSync(idxPath, next);
} else console.warn('index.html 에 SEO-LIST 표시가 없어 홈 목록은 건너뜁니다.');

console.log(`상품 ${products.length}개 → 페이지 ${units.length}개 (검색 노출 ${live.length}개), sitemap ${urls.length}개 주소`);
