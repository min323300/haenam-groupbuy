해남 공동구매 랜딩페이지 + 주문관리

파일
- index.html : 고객용 랜딩페이지
- admin.html : 관리자용 주문관리
- config.js : Supabase 주소와 anon key 입력
- supabase.sql : 데이터베이스 생성 SQL

기능
1. 예약 즉시 주문 접수 및 카운팅
2. 고객 화면 최근 예약 이력은 이름 마스킹
3. 관리자: 전화 확인 / 입금 확인 / 안내 완료 / 배송 완료 체크
4. 고객별 '입금 확인되었습니다' 문구 원클릭 복사
5. 관리자에서 상품명, 가격, 설명, 이미지 URL 변경

설치 순서
1. Supabase 프로젝트 생성
2. SQL Editor에서 supabase.sql 실행
3. Project Settings/API에서 Project URL과 anon key를 config.js에 입력
4. GitHub 저장소에 네 파일을 업로드
5. GitHub Pages를 활성화
6. index.html이 판매 페이지, admin.html이 관리자 화면입니다.

중요 보안
현재 버전은 기능 확인용 초안입니다. 주문자의 전화번호와 주소가 있으므로 실제 고객을 받기 전에
반드시 관리자 로그인(Supabase Auth)과 RLS를 강화해야 합니다.
관리자 페이지 주소를 숨기는 것만으로는 보안이 되지 않습니다.
다음 단계에서 관리자 비밀번호 로그인까지 붙이는 것을 권장합니다.
