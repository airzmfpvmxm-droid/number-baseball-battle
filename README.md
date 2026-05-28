# 숫자야구 배틀 랭킹전 - Firebase 버전

Netlify Functions와 Netlify Blobs를 사용하지 않는 정적 웹앱입니다.
Netlify는 화면을 배포하는 용도로만 쓰고, 게임방과 랭킹 데이터는 Firebase Firestore에 저장합니다.

## 기능

- 이름 입력 후 Firebase 익명 로그인
- 방 만들기 / 방 코드 입장
- 서로 다른 3자리 비밀 숫자 등록
- 2초마다 게임 상태 자동 갱신
- 턴제 숫자야구 배틀
- 승리 3점, 패배 0점 누적 랭킹
- matches 컬렉션에 경기 기록 저장

## 파일 구조

```txt
public/
  index.html
  style.css
  app.js
  firebase-config.js
netlify.toml
package.json
README.md
```

## 1. Firebase 프로젝트 만들기

1. Firebase Console 접속
2. 프로젝트 추가
3. 웹 앱 추가: `</>` 아이콘 클릭
4. 앱 이름 입력 후 등록
5. firebaseConfig 값 복사

## 2. firebase-config.js 수정

`public/firebase-config.js` 파일을 열고 Firebase Console에서 받은 설정값으로 바꿉니다.

```js
export const firebaseConfig = {
  apiKey: "실제값",
  authDomain: "실제값",
  projectId: "실제값",
  storageBucket: "실제값",
  messagingSenderId: "실제값",
  appId: "실제값"
};
```

## 3. Authentication 켜기

Firebase Console에서 다음 순서로 이동합니다.

```txt
Build → Authentication → Sign-in method → Anonymous 사용 설정
```

이름 입력 화면은 학생용 이름이고, 실제 로그인은 Firebase Anonymous Auth로 처리됩니다.

## 4. Firestore Database 켜기

Firebase Console에서 다음 순서로 이동합니다.

```txt
Build → Firestore Database → 데이터베이스 만들기
```

처음 테스트할 때는 테스트 모드로 시작해도 됩니다.

## 5. Firestore 규칙

수업 테스트용 규칙입니다. 공개 서비스용으로는 안전하지 않습니다.

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /players/{uid} {
      allow read, write: if request.auth != null;
    }

    match /numberBaseballRooms/{roomId} {
      allow read, write: if request.auth != null;
    }

    match /matches/{matchId} {
      allow read, create: if request.auth != null;
    }
  }
}
```

가장 단순한 완전 테스트용 규칙은 아래입니다. 수업 전 짧은 테스트 외에는 권장하지 않습니다.

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

## 6. GitHub에 올릴 때

GitHub 저장소 첫 화면에 아래 항목이 바로 보여야 합니다.

```txt
public
netlify.toml
package.json
README.md
```

`number-baseball-firebase-ranking` 폴더 자체를 올리면 안 됩니다. 폴더 안의 내용물을 올리세요.

## 7. Netlify 배포 설정

- Build command: `npm run build`
- Publish directory: `public`
- Functions directory: 없음. 비워둡니다.

## 주의

이 버전은 수업용 간단 구현입니다. 서버 검증 없이 Firestore에 게임 데이터가 저장되므로, 개발자 도구를 잘 아는 사용자가 데이터를 조작할 가능성을 완전히 막지는 못합니다. 일반적인 학급 활동용으로는 충분하지만, 공개 경쟁 서비스용으로는 Firebase Cloud Functions를 추가하는 방식이 더 안전합니다.
