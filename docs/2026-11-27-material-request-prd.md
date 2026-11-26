# PRD — 자재청구 현황

| 항목 | 내용 |
|------|------|
| 문서명 | 성능보드판 — 자재청구 현황 |
| 버전 | v1.0 (1~2단계) |
| 작성일 | 2026-11-27 |
| 대상 파일 | `material_request.html`(신규), `index.html`, `app.js`, `admin.html`, `database.rules.json`, `sw.js` |
| 인프라 | GitHub Pages + Firebase Realtime Database, 서버 없음 |
| 상태 | 1~2단계 구현 완료 · **DB 규칙 게시 필요** |

---

## 1. 목적

작업자가 청구한 자재와 그 처리 여부를 **넘버 · 공정 · PN · 수량 · 처리결과** 한 표로 모두가 실시간으로 본다.

## 2. 결정 사항 (2026-11-27)

- 넘버 · 공정 · 단위: **자율 입력** (공정·단위는 이미 쓴 값을 자동완성으로 추천)
- 담당자: **관리자가 회원 관리에서 지정** (`users/{id}.requestAdmin`, 다른 부관리자와 같이 영역당 한 명) + 주관리자(admin)
- 반려: **필요** — 사유 입력 필수 (DB 규칙에서도 검사)

## 3. 화면

- 툴바: 건수 · 미처리 수, 담당자 표시, `＋ 청구`
- 필터: 미처리(기본) / 전체 / 청구 / 접수 / 처리중 / 완료 / 반려 칩, 월 선택, 넘버·공정·PN 검색
- 표: 넘버(아래 청구자) · 공정 · PN · 수량(단위) · 처리결과 배지. 미처리가 위, 같은 묶음은 최근 청구가 위
- 행을 누르면 상세: 청구자 · 청구일시 · 처리자 · 처리일시 · 비고(반려 시 반려 사유)
- 폰(560px 미만)에서도 5칸이 가로 스크롤 없이 한 화면에 들어간다
- 대문 더보기 메뉴 `업무 도구` › `자재청구` 옆에 미처리 건수 배지

## 4. 처리결과와 권한

`requested 청구 → received 접수 → inProgress 처리중 → done 완료`, 어느 단계에서든 `rejected 반려`(사유 필수).

| 동작 | 작업자 | 담당자 | admin |
|------|:-:|:-:|:-:|
| 청구 등록 | O | O | O |
| 본인 청구 수정 · 취소 (‘청구’ 상태일 때만) | O | O | O |
| 처리결과 변경 · 반려 | – | O | O |
| 담당자 지정 · 해제 (회원 관리) | – | – | O |
| 남의 청구 삭제 | – | – | O |

## 5. 데이터

```
materialRequests/items/{pushId}
  no, process, pn, qty, unit, note,
  status: requested | received | inProgress | done | rejected,
  requester, createdAt, updatedAt, handler, handledAt
users/{id}/requestAdmin: true
```

로그(`logs`): `MATREQ_CREATE`, `MATREQ_UPDATE`, `MATREQ_UPDATE_STATUS`, `MATREQ_DELETE`.

## 6. 배포 체크

1. `database.rules.json`을 Firebase 콘솔 › Realtime Database › 규칙에 붙여넣고 **게시** (안 하면 저장은 되지만 값 검사가 빠짐)
2. 회원 관리에서 자재청구 담당자 지정
3. `sw.js` VERSION `v20261127-1` — 폰에서 앱을 한 번 다시 열면 새 페이지가 받아진다

## 7. 다음 단계 (선택)

- 처리결과에 받은 수량 기록 (부분 지급, 예: 완료 150/200)
- 같은 넘버로 등록한 PN 묶어 보기
- 완료 시 자재소모 재고에 수량 더하기, CSV 내보내기, 월별 삭제
