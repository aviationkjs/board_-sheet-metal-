# PRD — 인증 체계 개편 (ID + PIN)

| 항목 | 내용 |
|------|------|
| 문서명 | 성능기골 스티커 보드 — 인증 체계 개편 (ID + 4자리 PIN) |
| 버전 | v1.0 |
| 작성일 | 2026-07-24 |
| 대상 시스템 | https://aviationkjs.github.io/board_-sheet-metal-/ |
| 인프라 | Firebase Realtime Database, **Spark(무료) 요금제**, 서버(Cloud Functions) 없음 |
| 상태 | 승인됨 (설계 확정) → 구현 대기 |

---

## 1. 배경 및 문제 정의

현재 `auth.html`은 **비밀번호가 없는** 인증을 사용한다.

- 사용자 이름만 입력하면 즉시 접속되고, 없는 이름이면 자동으로 계정이 생성된다.
- 남의 이름을 알면 누구나 그 사람으로 로그인할 수 있다(사칭 가능).
- 관리자 구분은 이름이 `admin` 인지 문자열로만 판별한다 → **누구나 `admin` 이라고 입력하면 관리자**가 된다.
- "초기화" 기능은 하드코딩된 비번 `5678` 하나로 전체 사용자를 삭제한다.

이를 **ID + PIN(4자리)** 기반으로 바꿔, 최소한의 본인 확인과 권한 분리를 확보한다.
단, 인프라는 **Spark 무료 요금제 · 서버 없음**을 유지한다.

## 2. 목표 / 비목표

### 목표 (Goals)
1. 로그인 시 **ID + 4자리 숫자 PIN**으로 본인을 확인한다.
2. 사용자는 **최초 1회만** 자신의 ID와 PIN을 설정할 수 있다. 이후 스스로 변경할 수 없다.
3. 기존 PIN의 변경/초기화는 **관리자(admin)만** 수행한다.
4. Spark(무료) · 서버 없는 구조에서 동작한다.
5. 기존 게시판/사역표/자재소모 데이터에 영향을 주지 않는다.

### 비목표 (Non-goals)
1. **비밀번호(PIN) 찾기 기능은 만들지 않는다.** 분실 시 관리자 초기화로만 복구.
2. 이메일/휴대폰 인증, OTP, 소셜 로그인은 도입하지 않는다.
3. 유료 요금제(Blaze), Cloud Functions, Admin SDK는 사용하지 않는다.
4. 은행·금융 수준의 강한 보안은 목표가 아니다(§9 참조. 신뢰하는 내부 팀 기준).

## 3. 용어

| 용어 | 정의 |
|------|------|
| ID(아이디) | 사용자가 최초 설정 시 직접 정하는 로그인 식별자. 계정당 유일. |
| PIN | 4자리 숫자 비밀번호. |
| 초기 설정 | ID가 DB에 없을 때, 사용자가 PIN을 최초 1회 등록하는 절차. |
| pinHash | PIN을 평문 대신 저장하기 위한 SHA-256 해시값. |
| verify-by-write | PIN 해시를 읽지 않고, "규칙이 허용하는 쓰기가 성공하는지"로 PIN 일치를 판별하는 방식. |
| write-once | 값이 아직 없을 때만 쓰기를 허용하는 보안 규칙(한 번 쓰면 못 바꿈). |

## 4. 사용자 및 역할

| 역할 | 권한 |
|------|------|
| 일반 사용자 | 최초 1회 ID+PIN 설정 / 이후 ID+PIN 로그인 / 스티커·투표 등 기존 기능. **자신·타인 PIN 변경 불가.** |
| 관리자(`admin`) | 위 모든 것 + **타 사용자 PIN 초기화**, 사용자 삭제, 로그 조회, 전체삭제. |

- `admin` 은 **예약 ID**. 배포 전 실제 관리자가 가장 먼저 `admin` 계정을 등록해 선점한다(스쿼팅 방지, §8 롤아웃 참조).

## 5. 기능 요구사항 (FR)

- **FR-1** 로그인 화면은 `아이디`, `PIN(4자리 숫자)` 입력을 받는다.
- **FR-2** 입력한 ID가 DB에 **없으면** 초기 설정 모드로 전환한다: PIN을 2회 입력받아 일치를 확인한 뒤 계정을 생성하고 로그인한다.
- **FR-3** 입력한 ID가 **있으면** PIN을 검증한다. 일치 시 로그인, 불일치 시 오류 메시지를 표시한다.
- **FR-4** PIN은 정확히 4자리 숫자(`0-9`)만 허용한다. 형식 위반 시 클라이언트에서 즉시 안내한다.
- **FR-5** 사용자에게 **PIN 변경/재설정 UI를 제공하지 않는다.** 이미 PIN이 설정된 계정의 PIN은 코드·콘솔 우회로도 덮어쓸 수 없어야 한다(DB 규칙으로 강제).
- **FR-6** PIN 분실 시 화면에는 "관리자에게 초기화를 요청하세요" 안내만 표시한다(찾기 기능 없음).
- **FR-7** 로그인 성공 시 세션은 기존과 동일하게 `localStorage.username`(= ID)로 유지한다. 다른 페이지의 로그인 확인 로직은 변경하지 않는다.
- **FR-8** 관리자 화면(admin 로그인 시 노출):
  - **FR-8.1** 특정 사용자 **PIN 초기화**: `secrets/{id}/pinHash` 를 삭제하고 `users/{id}/hasPin = false` 로 표시한다(프로필·기록 유지). 해당 사용자는 다음 접속 때 같은 아이디로 초기 설정 흐름을 다시 타 새 PIN을 등록한다.
  - **FR-8.2** 특정 사용자 **삭제**: `users/{id}` 와 `secrets/{id}/pinHash` 를 제거한다(작성한 스티커 등 데이터는 유지).
  - **FR-8.3** 로그 조회(기존 `logs.html`) 및 전체삭제(기존 `deleteAll`) 유지.
- **FR-9** 기존 하드코딩 초기화 비번(`5678`) 및 비밀번호 없는 "초기화" 흐름은 제거한다. 관리 기능은 admin 로그인 뒤에만 접근 가능하다.
- **FR-10** 기존 사용자 수 제한(`MAX_USERS = 31`)은 유지한다.

## 6. 비기능 요구사항 (NFR)

- **NFR-1** PIN은 평문으로 저장하지 않는다(해시 저장).
- **NFR-2** 어떤 사용자도 타인의 pinHash를 **읽을 수 없어야** 한다(DB 읽기 규칙 차단).
- **NFR-3** 서버 없이(Spark) 100% 클라이언트 + DB 보안 규칙으로 동작한다.
- **NFR-4** 변경 범위는 `auth.html` + Firebase 보안 규칙 + 신규 관리 UI로 국한한다. `app.js` 등 다른 페이지의 세션·권한 로직은 건드리지 않는다.

## 7. 인증 흐름 (상세)

### 7.1 초기 설정 (신규 사용자)
```
[아이디 입력] → DB에 없음
  → "새 계정입니다. PIN을 설정하세요" 모드
  → PIN 4자리 2회 입력(일치 확인)
  → secrets/{id}/pinHash 생성 (write-once) + users/{id} 프로필 생성
  → localStorage.username = id → index.html 이동
```

### 7.2 로그인 (PIN이 설정된 기존 사용자)
분기 기준은 `users/{id}` 존재 **및** `hasPin === true` 이다.
```
[아이디 + PIN 입력] → users/{id} 존재 & hasPin=true
  → 클라이언트가 hash = SHA-256(id + ":" + PIN) 계산
  → 적응형 검증(verifyPin):
      · secrets/{id}/pinHash 읽기 성공(규칙 미강화) → 로컬 해시 비교
      · 읽기 차단(규칙 강화)   → secrets/{id}/loginProbe 에 hash 쓰기 시도
            - 쓰기 성공(규칙 통과) = PIN 정답
            - PERMISSION_DENIED   = PIN 불일치
  → 정답이면 lastLogin 갱신 → 로그인, 아니면 오류 표시
```
> **적응형 이유:** 보안 규칙 배포는 Firebase 콘솔에서 별도로 수행된다(부록 A). 규칙 강화 전에는 읽기 비교로 정상 동작하고, 규칙 강화 후에는 읽기가 차단되어 verify-by-write 로 자동 전환된다. 두 상태 모두에서 틀린 PIN은 거부된다.

### 7.3 PIN 분실
```
사용자: 로그인 불가 → 화면 안내 "관리자에게 초기화 요청"
관리자: 회원 관리에서 해당 사용자 PIN 초기화(secrets/{id}/pinHash 삭제 + hasPin=false)
사용자: 다음 접속 시 같은 아이디 → hasPin=false 감지 → 초기 설정 흐름 → 새 PIN 등록
```

## 8. 데이터 모델

민감정보(해시)와 공개 프로필을 **다른 경로로 분리**한다.

```
users/                         # 읽기 허용 (존재 확인·인원수·프로필용, 민감정보 없음)
  {id}/
    createdAt : number
    lastLogin : number
    hasPin    : boolean         # PIN 설정 여부 → 로그인/최초설정 분기 기준

secrets/                       # 읽기 전면 차단
  {id}/
    pinHash   : string(64)     # SHA-256(id + ":" + PIN), 덮어쓰기 불가(생성/삭제만)
    loginProbe: string         # verify-by-write 용 임시 경로(비공개)
```

- **분리 이유:** Realtime DB의 `.read` 규칙은 하위로 전파되므로, 한 노드 아래 두면 프로필을 공개하는 순간 해시까지 노출된다. 경로를 나눠 `users`는 공개, `secrets`는 완전 차단한다.
- **`hasPin` 이 분기 기준인 이유:** 강화된 규칙에서는 `secrets` 읽기가 막혀 pinHash 존재 여부를 직접 확인할 수 없다. 그래서 읽기 가능한 `users/{id}/hasPin` 으로 "PIN 설정됨/미설정"을 판별한다. 이 값을 조작해도 pinHash 쓰기 규칙(생성/삭제만 허용)이 무단 변경을 막으므로 보안에는 영향이 없다.
- **기존 사용자 이관:** 구(旧) 시스템의 `users/{name}` 에는 `hasPin` 이 없다 → `hasPin!==true` 로 간주되어 첫 접속 시 자동으로 PIN 초기 설정 흐름을 탄다(별도 마이그레이션 불필요).
- 계정 생성/설정 시 `secrets/{id}/pinHash` 와 `users/{id}(hasPin=true)` 를 함께 기록한다.
- `notes`, `duty`, `logs`, 자재소모 등 기존 데이터는 사용자를 **이름(ID) 문자열**로 참조하므로 구조 변경·이관이 없다.

## 9. 보안 모델과 한계 (명시적 고지)

본 설계는 **"신뢰하는 내부 팀"** 수준을 목표로 한다.

**보장되는 것**
- PIN 평문 미저장 + 해시 읽기 차단 → **타인의 PIN(해시)을 볼 수 없음.**
- write-once 규칙 → 설정된 PIN은 **코드/콘솔 우회로도 덮어쓸 수 없음** ("최초 1회 설정"의 DB 레벨 보증).
- verify-by-write → 로그인 검증에 해시 읽기 권한이 필요 없음.

**한계 (수용된 리스크)**
- 서버가 없어 "관리자만"을 **암호학적으로 강제하지 못한다.** 관리 기능은 앱 레벨(admin 로그인)로 가드된다.
- `admin` ID는 배포 전 선점으로 보호하나, DB 규칙 자체가 관리자 신원을 검증하지는 않는다.
- 사용자 계정 삭제/초기화 쓰기는 규칙상 광범위하게 허용될 수 있어(앱에서만 admin 가드), 악의적 내부자에 의한 계정 삭제(그리핑) 가능성이 남는다. 이는 현재(누구나 `5678`로 전체 삭제 가능)보다 개선된 수준이며, 내부 신뢰 팀 기준에서 수용한다.
- 4자리 PIN은 온라인 추측 공격에 약하나(경우의 수 10,000), 해시 미공개·내부 사용 전제에서 충분하다.

**채택하지 않은 대안:** Firebase Auth(이메일/비번 매핑)는 로그인 보안은 강하나, Spark에서는 관리자가 *타 사용자*의 비밀번호를 앱에서 변경할 수 없어(Admin SDK 필요) FR-8.1과 충돌 → 배제.

## 10. 마이그레이션 · 영향 범위 · 롤아웃

### 마이그레이션
- 기존 사용자는 **같은 ID(기존 이름)로 첫 로그인** 시 초기 설정 흐름을 타 PIN만 새로 등록한다. 기존 노트/데이터는 그대로 연결된다.
- 기존 `users/{name}` 항목에는 pinHash가 없으므로 자연히 "미설정 → 초기 설정 대상"으로 처리된다.

### 영향 범위
| 구성요소 | 변경 |
|----------|------|
| `auth.html` | **전면 개편** (ID+PIN, 초기 설정, verify-by-write, 관리 UI 진입) |
| Firebase 보안 규칙 | **신규/개편** (§부록 A) |
| 관리 UI | **신규** (admin 로그인 시: 사용자 PIN 초기화/삭제) |
| `app.js`, 기타 페이지 | **변경 없음** (`localStorage.username`, `=== 'admin'` 유지) |

### 롤아웃 순서
1. Firebase 콘솔에서 보안 규칙 배포(§부록 A).
2. 실제 관리자가 **가장 먼저 `admin` 계정을 등록**해 선점.
3. `auth.html` 및 관리 UI 배포.
4. 팀에 안내: 기존 이름으로 접속해 PIN 최초 설정.

## 11. 인수 조건 (Acceptance Criteria)

- [ ] 신규 사용자가 ID+PIN을 1회 설정한 뒤 로그인된다.
- [ ] 재로그인 시 화면 어디에도 PIN 변경/재설정 UI가 없다.
- [ ] 브라우저 콘솔/직접 쓰기로 기존 `secrets/{id}/pinHash` 덮어쓰기를 시도하면 **PERMISSION_DENIED**로 실패한다.
- [ ] 임의 사용자가 `secrets` 경로를 읽으려 하면 실패한다(타인 PIN 해시 조회 불가).
- [ ] 틀린 PIN으로 로그인 시 명확한 오류가 뜨고, 맞는 PIN으로만 진입한다.
- [ ] admin 로그인 시에만 관리 UI가 노출되고, 사용자 PIN 초기화 후 해당 사용자가 새 PIN을 재설정해 로그인할 수 있다.
- [ ] 기존 하드코딩 `5678` 초기화 흐름이 제거되었다.
- [ ] `MAX_USERS = 31` 제한이 유지된다.
- [ ] 기존 스티커/사역표/자재소모 데이터가 정상 표시된다.

## 12. 미해결 · 향후 과제

- 로그인 실패 시도 제한(rate limiting)은 Spark에서 어렵다 → 필요 시 Blaze + Cloud Functions 검토(별도 과제).
- 계정 삭제 그리핑 방지 강화(진짜 관리자만 삭제)는 Firebase Auth 도입이 전제 → 향후 보안 요구 상향 시 재검토.

---

## 부록 A. Firebase Realtime Database 보안 규칙 (구현 지침)

> 구현 시 프로젝트 상황에 맞게 조정. 핵심은 (1) `secrets` 읽기 차단, (2) `pinHash` write-once, (3) `loginProbe`로 verify-by-write.

```json
{
  "rules": {
    "users": {
      ".read": true,
      "$id": {
        ".write": true,
        "createdAt": { ".validate": "newData.isNumber()" },
        "lastLogin": { ".validate": "newData.isNumber()" },
        "hasPin":    { ".validate": "newData.isBoolean()" }
      }
    },
    "secrets": {
      ".read": false,
      "$id": {
        "pinHash": {
          ".write": "!data.exists() || !newData.exists()",
          ".validate": "newData.isString() && newData.val().length === 64"
        },
        "loginProbe": {
          ".write": "newData.val() === data.parent().child('pinHash').val()"
        }
      }
    },
    "notes":               { ".read": true, ".write": true },
    "duty":                { ".read": true, ".write": true },
    "logs":                { ".read": true, ".write": true },
    "materialConsumption": { ".read": true, ".write": true }
  }
}
```
> 앱이 사용하는 전체 경로: `users`, `secrets`, `notes`, `duty`, `logs`, `materialConsumption`. 위 규칙은 이를 모두 포함하므로 **규칙 전체를 이 내용으로 교체**해도 기존 기능이 막히지 않는다.

**규칙 설명**
- `secrets/.read: false` → 해시·검증 경로 전체 읽기 차단. (강화 후 로그인은 verify-by-write로 동작)
- `secrets/$id` 에는 `.write` 를 두지 않는다 → 상위에서 쓰기 권한이 전파되지 않아, 아래 잎(leaf) 규칙이 그대로 적용된다.
- `pinHash`의 `".write": "!data.exists() || !newData.exists()"` → **없을 때 생성** 또는 **삭제(초기화)만** 허용, 값이 있는 상태에서의 **덮어쓰기는 거부**. → "최초 1회만 설정, 사용자는 변경 불가"를 DB 레벨에서 보증. 관리자 초기화는 이 규칙이 허용하는 *삭제*로 처리한다.
- `loginProbe`의 `".write": "newData.val() === data.parent().child('pinHash').val()"` → 저장된 해시와 **같은 값을 쓸 때만 성공** → 쓰기 성공/실패로 PIN 일치를 판별(해시를 읽지 않음).
- `pinHash` 삭제/`users/{id}` 쓰기는 규칙상 누구에게나 열려 있어(§9의 수용된 리스크), 초기화·삭제 기능은 앱 레벨(admin 로그인)로 가드된다.
- `notes`/`duty`/`logs`는 기존 동작 유지를 위해 개방(현행과 동일 수준). 필요 시 후속 과제로 강화.

## 부록 B. 참고 — PIN 해시 계산 (클라이언트)

```js
async function pinHash(id, pin) {
  const data = new TextEncoder().encode(`${id}:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
```
