# 숫자야구 배틀 - Netlify 2초 갱신 버전

서로 다른 기기에서 방 코드로 접속해 숫자야구를 할 수 있는 HTML 기반 프로젝트입니다.

## 구성

- `public/index.html`: 화면
- `public/style.css`: 디자인
- `public/app.js`: 클라이언트 로직, 2초 자동 갱신
- `netlify/functions/game.js`: 방 생성, 입장, 비밀 숫자 저장, 판정 API
- `netlify.toml`: Netlify 배포 설정

## 실행 방법

### 1. 압축을 풀고 설치

```bash
npm install
```

### 2. Netlify 로그인 및 연결

```bash
npx netlify login
npx netlify init
```

### 3. 로컬 테스트

```bash
npx netlify dev
```

브라우저에서 안내되는 주소로 접속합니다. 같은 와이파이에서 다른 기기로 테스트하려면 배포 후 Netlify 주소로 접속하는 편이 가장 쉽습니다.

### 4. 배포

GitHub에 올린 뒤 Netlify와 연결하거나, Netlify CLI로 배포합니다.

```bash
npx netlify deploy --prod
```

## 사용 방법

1. 한 기기에서 `방 만들기`를 누릅니다.
2. 표시된 4자리 방 코드를 상대에게 알려줍니다.
3. 상대 기기에서 방 코드를 입력하고 입장합니다.
4. 각자 서로 다른 숫자 3개를 비밀 숫자로 등록합니다.
5. 방장부터 번갈아 추측합니다.
6. 3스트라이크를 먼저 맞히면 승리합니다.

## 참고

이 프로젝트는 수업용 간단 구현입니다. 비밀 숫자는 브라우저가 아니라 Netlify Function/Blobs 쪽에 저장되며, 클라이언트에는 자신의 숫자와 상대의 등록 여부만 전달됩니다.
