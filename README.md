# 숫자야구 배틀 게임 - Netlify 버전

두 기기에서 방 코드로 접속해 숫자야구를 할 수 있는 HTML/JavaScript + Netlify Functions 게임입니다.

## 배포 설정

Netlify에서 GitHub 저장소를 연결할 때 다음 설정을 사용합니다.

- Build command: `npm run build`
- Publish directory: `public`
- Functions directory: `netlify/functions`

## 파일 구조

```text
public/
netlify/functions/game.mjs
netlify.toml
package.json
README.md
```

GitHub 첫 화면에 위 항목들이 바로 보여야 합니다. 바깥 폴더나 zip 파일을 올리면 안 됩니다.

## v3 수정 사항

Netlify Blobs의 `MissingBlobsEnvironmentError`를 줄이기 위해 Functions v2 방식의 기본 export handler 안에서 직접 `getStore()`를 실행하도록 수정했습니다.
