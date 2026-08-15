# Firebase 실시간 데이터베이스 규칙 — 복사·붙여넣기용

`저장에 실패했습니다` 오류는 **콘솔에 배포된 규칙에 `drill_rows` 가 없어서** 납니다.
Realtime Database 는 규칙에 선언되지 않은 경로에 대한 쓰기를 전부 거부합니다.

붙여넣는 곳: [Firebase 콘솔](https://console.firebase.google.com/) → 프로젝트 `board-sheet-metal`
→ 왼쪽 **Realtime Database** → 상단 **규칙(Rules)** 탭 → 전체 선택 후 덮어쓰기 → **게시(Publish)**

---

## A안 — 지금 바로 (권장 · 현재 앱 그대로 동작)

기존 규칙에 `drill_rows` 만 더한 **완성본**입니다. 아래 전체를 그대로 복사해 붙여넣고 게시하면 저장이 됩니다.
**코드는 하나도 바꾸지 않아도 됩니다.**

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
    "materialConsumption": { ".read": true, ".write": true },
    "fighterjet_scores":   { ".read": true, ".write": true },
    "drill_rows": {
      ".read": true,
      ".write": true,
      "$id": {
        "inch":  { ".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 4" },
        "inchMax":  { ".validate": "!newData.exists() || (newData.isNumber() && newData.val() > 0 && newData.val() <= 4)" },
        "no":    { ".validate": "!newData.exists() || (newData.isNumber() && newData.val() >= 1 && newData.val() <= 200)" },
        "frac":  { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 12)" },
        "memo":  { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 200)" },
        "cleco": { ".validate": "!newData.exists() || newData.val() === 'silver' || newData.val() === 'copper' || newData.val() === 'black' || newData.val() === 'brass'" },
        "photo": { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 120)" },
        "$other": { ".validate": true }
      }
    },
    "drill_overrides": {
      ".read": true,
      ".write": true,
      "$key": {
        "hidden": { ".validate": "!newData.exists() || newData.isBoolean()" },
        "inch":   { ".validate": "!newData.exists() || (newData.isNumber() && newData.val() > 0 && newData.val() <= 4)" },
        "inchMax":  { ".validate": "!newData.exists() || (newData.isNumber() && newData.val() > 0 && newData.val() <= 4)" },
        "no":     { ".validate": "!newData.exists() || (newData.isNumber() && newData.val() >= 1 && newData.val() <= 200)" },
        "frac":   { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 12)" },
        "memo":   { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 200)" },
        "cleco":  { ".validate": "!newData.exists() || newData.val() === 'silver' || newData.val() === 'copper' || newData.val() === 'black' || newData.val() === 'brass'" },
        "photo":  { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 120)" },
        "$other": { ".validate": true }
      }
    }
  }
}
```

> 이 저장소의 `database.rules.json` 과 **같은 내용**입니다. 파일을 열어 복사해도 됩니다.

### A안의 한계 (솔직하게)

**쓰기 권한이 서버에서 막혀 있지 않습니다.** `notes` · `duty` · `logs` · `materialConsumption` 과 마찬가지로 누구나 쓸 수 있고, "관리자만"은 브라우저(localStorage 사용자명)에서만 판별합니다. DB 주소를 아는 사람은 API 로 직접 쓸 수 있습니다.

사내 도구 수준에서는 기존 페이지들과 동일한 수준이며, 값 범위 검증(`inch` 0~4, 클리코 4색 등)만 규칙에서 막습니다. **진짜 권한 통제가 필요하면 B안으로 갑니다.**

---

## B안 — Firebase Auth 도입 후 (관리자만 변경)

**⚠️ 이 규칙을 먼저 붙여넣으면 앱 전체가 멈춥니다.** 아래 §B-1 코드 변경과 §B-2 콘솔 설정을 마친 뒤에 게시하세요.

```json
{
  "rules": {
    "admins": {
      ".read": "auth != null",
      ".write": false
    },
    "users": {
      ".read": "auth != null",
      "$id": {
        ".write": "auth != null",
        "createdAt": { ".validate": "newData.isNumber()" },
        "lastLogin": { ".validate": "newData.isNumber()" },
        "hasPin":    { ".validate": "newData.isBoolean()" }
      }
    },
    "secrets": {
      ".read": false,
      "$id": {
        "pinHash": {
          ".write": "auth != null && (!data.exists() || !newData.exists())",
          ".validate": "newData.isString() && newData.val().length === 64"
        },
        "loginProbe": {
          ".write": "auth != null && newData.val() === data.parent().child('pinHash').val()"
        }
      }
    },
    "notes":               { ".read": "auth != null", ".write": "auth != null" },
    "duty":                { ".read": "auth != null", ".write": "auth != null" },
    "logs":                { ".read": "auth != null", ".write": "auth != null" },
    "materialConsumption": { ".read": "auth != null", ".write": "auth != null" },
    "fighterjet_scores":   { ".read": "auth != null", ".write": "auth != null" },
    "drill_rows": {
      ".read": true,
      ".write": "auth != null && root.child('admins').child(auth.uid).val() === true",
      "$id": {
        "inch":  { ".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 4" },
        "no":    { ".validate": "!newData.exists() || (newData.isNumber() && newData.val() >= 1 && newData.val() <= 200)" },
        "frac":  { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 12)" },
        "memo":  { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 200)" },
        "cleco": { ".validate": "!newData.exists() || newData.val() === 'silver' || newData.val() === 'copper' || newData.val() === 'black' || newData.val() === 'brass'" },
        "photo": { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 120)" },
        "$other": { ".validate": true }
      }
    },
    "drill_overrides": {
      ".read": true,
      ".write": "auth != null && root.child('admins').child(auth.uid).val() === true",
      "$key": {
        "hidden": { ".validate": "!newData.exists() || newData.isBoolean()" },
        "inch":   { ".validate": "!newData.exists() || (newData.isNumber() && newData.val() > 0 && newData.val() <= 4)" },
        "no":     { ".validate": "!newData.exists() || (newData.isNumber() && newData.val() >= 1 && newData.val() <= 200)" },
        "frac":   { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 12)" },
        "memo":   { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 200)" },
        "cleco":  { ".validate": "!newData.exists() || newData.val() === 'silver' || newData.val() === 'copper' || newData.val() === 'black' || newData.val() === 'brass'" },
        "photo":  { ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 120)" },
        "$other": { ".validate": true }
      }
    }
  }
}
```

핵심은 `drill_rows` 한 줄입니다.

```
".write": "auth != null && root.child('admins').child(auth.uid).val() === true"
```

→ **DB 의 `admins/{uid}` 에 등록된 사람만** 드릴 표를 고칠 수 있습니다 (`drill_rows` · `drill_overrides` 동일). `admins` 자체는 `.write: false` 라 **콘솔에서만** 손댈 수 있고, 앱 코드로는 자기를 관리자로 올릴 수 없습니다. 표 읽기는 `.read: true` 라 로그인 없이도 계속 보입니다.

### B-1. 필요한 코드 변경 (아직 안 되어 있음)

익명 인증(Anonymous Auth)을 쓰면 **기존 아이디 + 4자리 PIN 로그인 화면을 그대로 두고** 서버 권한만 얻을 수 있습니다.

1. `auth.html` · `app.js` · `info.html` · `remove_list.html` · `duty_roster.html` · `game.js` 등 **DB 를 쓰는 모든 페이지**에서, DB 호출 **전에** 익명 로그인을 먼저 한다.
   ```js
   import { getAuth, signInAnonymously, onAuthStateChanged }
     from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
   const auth = getAuth(app);
   await signInAnonymously(auth);      // 이 줄이 끝난 뒤에 DB 접근
   ```
2. `info.html` 관리자 화면에 **자기 uid 를 보여주는 자리**를 만든다 (콘솔에 등록할 때 필요).
3. PIN 로그인 순서를 `익명 로그인 → PIN 검증` 으로 바꾼다. (`secrets/loginProbe` 쓰기에도 `auth != null` 이 필요해짐)

> 말씀 주시면 이 코드 변경을 진행하겠습니다. **모든 페이지를 건드리는 작업**이라 별도로 확인받고 하는 게 안전합니다.

### B-2. 콘솔 설정

1. Firebase 콘솔 → **Authentication** → **Sign-in method** → **익명(Anonymous)** 사용 설정
2. 관리자 폰/PC 에서 앱을 한 번 열고, 화면에 뜬 **uid** 를 복사
3. Realtime Database → **데이터** 탭에서 다음을 손으로 추가

   ```
   admins
     └ 복사한_uid : true
   ```
4. 그 다음에 위 B안 규칙을 게시

### B-3. 알아둘 점

| 항목 | 내용 |
|------|------|
| 기기별 uid | 익명 uid 는 **브라우저마다 다릅니다.** 관리자가 폰·PC 둘 다 쓰면 uid 를 두 개 등록해야 합니다 |
| 저장소 비우면 | 브라우저 데이터를 지우면 uid 가 새로 발급됩니다 → 재등록 필요 |
| 기존 로그인 | PIN 방식은 **그대로 유지**됩니다. 사용자가 다시 가입할 필요 없습니다 |
| 더 튼튼하게 | uid 대신 아이디·비밀번호(이메일/비밀번호 provider)로 가면 기기가 바뀌어도 같은 uid 를 씁니다. 대신 **기존 사용자 전원이 재가입**해야 합니다 |

---

## 확인 방법

규칙을 게시한 뒤 `admin` 으로 로그인해 드릴 표에서 행을 추가해 보세요.

| 증상 | 원인 | 조치 |
|------|------|------|
| `권한이 없습니다 — … drill_rows / drill_overrides …` | 규칙 미배포 | A안 붙여넣기 |
| `저장에 실패했습니다 (네트워크)` | 오프라인·차단 | 통신 확인 |
| 관리자 바 자체가 안 보임 | `localStorage.username !== "admin"` 또는 Firebase 미연결 | `admin` 으로 로그인 |
