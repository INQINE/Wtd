# SD 이미지 생성 가이드 (레퍼런스 그림체 재현)

코드로 그리는 SD(`SD_디자인_가이드.md`)는 임시용이다.
레퍼런스처럼 **손그림 질감 + 촘촘한 디테일**의 그림체는 이미지 생성 AI로 만들고, 게임에 넣는 과정은 자동화해 두었다.

```
캐릭터 사진 ──(이미지 생성 앱 + 아래 프롬프트)──▶ SD 그림(PNG/JPG/WEBP)
      ──(채팅에 올리기)──▶ Claude가 npm run sd:import 실행 ──▶ 게임에 바로 반영
```

---

## 1. 레퍼런스 그림체 분석

| 항목 | 특징 |
|---|---|
| 비율 | 2~2.5등신. 크고 넓은 머리, 작고 단단한 몸, 짧은 다리 |
| 자세 | 다리를 넓게 벌리고 무릎을 살짝 굽힌 **전투 대기 자세**, 3/4 측면으로 오른쪽을 봄, 전신 |
| 선 | **굵고 어두운(갈색빛 검정) 외곽선**, 약간 거친 손그림 느낌, 굵기 변화 있음 |
| 채색 | 2단계 셀 채색 + 머리카락의 **딱 떨어지는 광택 하이라이트**. 채도 낮은 회색·검정·흰색 위주에 노랑·빨강·청록 같은 포인트 색 1~2개 |
| 얼굴 | 세로로 긴 큰 눈, 그라데이션 홍채, 작은 흰 하이라이트, 무표정하거나 진지한 표정, 아주 작은 입 |
| 머리카락 | 끝이 뾰족한 굵은 덩어리, 광택 띠 |
| 의상 | **테크웨어 디테일**: 끈, 버클, 주머니, 벨트, 지퍼, 태그, 번호/로고 |
| 무기·소품 | 몸만큼 크거나 더 큰 **기계식 무기**, 아주 세밀함 |
| 기타 | 동물 귀·꼬리가 자주 등장, 투박한 운동화/부츠 |

---

## 2. 추천 앱

| 앱 | 장점 | 단점 | 추천 상황 |
|---|---|---|---|
| **ChatGPT** (이미지 생성) | 사진과 레퍼런스를 같이 올리고 말로 지시하면 됨. 수정 요청도 쉬움 | 무료는 하루 생성 수 제한 | **처음 해보기에 가장 쉬움** |
| **Google Gemini** (이미지 생성/편집) | 사진 속 인물 특징을 잘 유지함, 무료 사용량이 있음 | 그림체가 가끔 흔들림 | 사진 특징을 최대한 살리고 싶을 때 |
| **NovelAI / niji journey** | 애니메이션 그림체 특화, 퀄리티 높음 | 유료, 사진 기반 변환은 덜 직관적 | 그림체 퀄리티가 최우선일 때 |
| **Stable Diffusion (ComfyUI)** 로컬 | 치비 스타일 모델 + 레퍼런스 고정(IP-Adapter)으로 **모든 멤버 그림체 통일**이 가장 잘 됨, 무제한 | NVIDIA 그래픽카드 PC가 필요하고 설정이 어려움 | 멤버가 많아져서 통일감이 중요할 때 |

### 자동화 (Gemini API, OpenAI도 지원)
API 키를 이 저장소 전용 클라우드 환경(`Wtd`)의 **Network secrets**에 저장해 두면, Claude가 직접 생성해서 게임에 넣는다.

| 서비스 | Host | Header | 값 |
|---|---|---|---|
| Gemini (기본) | `generativelanguage.googleapis.com` | `Authorization` | `Bearer <키>` (Gemini의 OpenAI 호환 주소 사용) |
| OpenAI | `api.openai.com` | `Authorization` | `Bearer <키>` |

- 키는 환경의 보안 저장소에만 있고, 저장소나 코드에는 없다. 요청을 보낼 때 네트워크 프록시가 키를 넣어준다.
- 이미지 1장마다 API 사용료가 든다. Gemini 이미지 모델은 유료 등급 전용이라 AI Studio에서 결제 설정이 필요하다 (https://aistudio.google.com/billing).

```bash
npm run sd:generate -- <멤버id> --photo 사진1.png,사진2.jpg --class caster --weapon "microphone staff" --n 2
npm run sd:generate -- <멤버id> --desc "보라색 긴 머리, ..." --class medic      # 사진 없이 설명만으로
npm run sd:generate -- <멤버id> --photo 사진.png --provider openai               # OpenAI로 생성
```
- Gemini는 사용 가능한 최신 이미지 모델을 자동으로 고른다 (`--model`로 직접 지정 가능).
- 레퍼런스 그림체 시트는 `.sd-ref/style-sheet.png`, 생성 원본은 `.sd-raw/`에 저장된다 (둘 다 git 제외).
- `--n 2`로 후보를 여러 장 만들면 첫 장이 자동으로 들어간다. 다른 후보로 바꾸려면 `npm run sd:import -- .sd-raw/<파일> <멤버id>`.

---

## 3. 프롬프트 (복사해서 사용)

**올릴 것**: ① 캐릭터 사진 ② 레퍼런스 SD 시트 (그림체 참고용)

```
Convert the character in the first image into a chibi battle sprite,
drawn in exactly the same art style as the second image (reference sheet).

Style
- super-deformed chibi, about 2.5 heads tall: big wide head, compact body, short sturdy legs
- full body, wide combat-ready stance with knees slightly bent, 3/4 view facing right
- thick dark brown-black outlines with a slightly rough hand-drawn line quality
- two-tone cel shading, sharp glossy highlights on the hair
- muted, slightly desaturated palette with 1-2 saturated accent colors
- large vertical oval eyes with gradient irises and a small white highlight, calm serious face, tiny mouth

Character
- keep the hairstyle, hair color, eye color, outfit and accessories from the photo
- add techwear details: straps, buckles, pouches, belts, zippers, small tags
- holding an oversized, highly detailed mechanical {무기} (class: {클래스})

Output
- one character only, centered, entire body visible including feet, margin around it

Background (important — the image will be cut out automatically):
- PREFERRED: export as a PNG with a REAL transparent background (alpha channel). Do NOT draw a gray/white checkerboard pattern.
- If a real transparent background is not possible: fill the ENTIRE background with one flat solid color #00FF00 (pure green),
  no gradient, no shadow, no glow on the background. If the character has green in it, use #FF00FF (pure magenta) instead.
- The background color must also fill every gap inside the silhouette (between arms and body, between hair strands,
  inside rings or holes of the weapon). Never leave white fill in those gaps.
- no ground shadow, no text, no border, no frame
```

`{무기}`와 `{클래스}`는 아래 표에서 골라 바꾸면 된다.

| 클래스 | {클래스} | {무기} 예시 |
|---|---|---|
| 뱅가드 | vanguard | spear / flag lance |
| 가드 | guard | sword / greatsword / katana |
| 디펜더 | defender | huge tower shield and hammer |
| 스나이퍼 | sniper | crossbow / long rifle |
| 캐스터 | caster | magic staff / microphone staff |
| 메딕 | medic | healing staff / giant syringe |
| 서포터 | supporter | spell book / drone |
| 스페셜리스트 | specialist | hook chain / dual daggers |

### 배경(누끼) 규칙
- **ChatGPT**: 투명 배경 PNG를 만들 수 있어서 가장 좋다. 결과에 회색·흰색 체크무늬가 *그려져* 있으면 진짜 투명이 아니니 아래 수정 문구로 다시 요청.
- **Gemini**: 투명 배경을 못 만들기 때문에 **초록(#00FF00) 단색 배경**으로 받는다 (초록이 들어간 캐릭터는 마젠타 #FF00FF).
- 흰 배경은 흰 머리·흰 옷과 구분이 안 돼서 누끼가 지저분해지니 쓰지 않는다.

### 수정할 때 쓰는 말 (생성 결과를 보고)
- 체크무늬가 그려졌을 때: `That checkerboard is drawn, not transparent. Redo it on a flat solid #00FF00 green background instead.`
- 틈이 하얗게 남았을 때: `Fill the gaps between the arms, hair and weapon with the same green background color too.`
- 그림체가 다를 때: `Match the reference line thickness and shading more closely.`
- 너무 작게/잘릴 때: `Show the full body including feet, centered, with margin.`
- 방향이 반대일 때: `Face to the right in 3/4 view.`
- 사진과 안 닮았을 때: `Keep the hair shape and outfit colors exactly like the photo.`

---

## 4. 게임에 넣기

1. 생성된 그림을 채팅에 올리고 어느 멤버인지 알려준다 (예: "이거 릴파").
2. 내가 아래 명령으로 넣는다. 흰 배경이나 투명 배경은 자동으로 지워진다.
   ```bash
   npm run sd:import -- <이미지 경로> <멤버id> [--facing left] [--scale 1.2]
   ```
3. 결과: `public/assets/sd/<id>.png`와 `manifest.json`이 갱신되고, 전투 유닛·덱 카드·정보창·SD 도감에 바로 적용된다.

| 옵션 | 쓰는 경우 |
|---|---|
| `--facing left` | 그림이 왼쪽을 보고 있을 때 (게임에서 자동으로 뒤집음) |
| `--scale 1.2` | 무기가 너무 커서 캐릭터가 작아 보일 때 |
| `--crop x,y,w,h` | 여러 캐릭터가 있는 시트에서 하나만 잘라 쓸 때 |
| `--tolerance 20` | 배경 지우기가 캐릭터 일부까지 지울 때 (값을 낮춤) |
| `--hole-region x0,y0,x1,y1` | 흰 배경 그림에서 캐릭터 안쪽에 갇힌 흰 틈을 지울 영역 (0~1 비율, 여러 개는 `;`). 초록/마젠타 배경이면 필요 없음 (자동) |

`manifest.json`에서 `face: [x, y, w, h]` (0~1 비율)를 직접 넣으면 덱 카드에 보이는 얼굴 부분을 조정할 수 있다.

---

## 5. 애니메이션 (표준 방식: 그림 1장 + 코드 모션)

**결정 (2026-11-13)**: 프레임 시트보다 **그림 1장에 코드로 움직임을 붙이는 방식**이 가장 자연스러워서 이것을 표준으로 한다.
각 캐릭터는 대기 SD 그림 1장만 만들면 되고, Claude가 manifest에 무기 끝 위치(`tip`)와 이펙트 색(`fxColor`)을 지정한다.

| 클래스 | 모션 | 무기 끝 이펙트 |
|---|---|---|
| 캐스터·메딕·서포터 | 뒤로 젖히며 들어올림 → 앞으로 내밀기 → 복귀 (0.55초) | 빛 폭발 + 별 반짝이, 메딕은 회복 빛이 대상에게 날아감 |
| 가드·디펜더·뱅가드·스페셜리스트 | 움츠림 → 앞으로 내지르기 → 복귀 (0.38초) | 초승달 베기 궤적 |
| 스나이퍼 | 반동 (0.25초) | 총구 섬광 + 불꽃 |

공통: 대기 중 숨쉬기, 피격 시 붉은 번쩍임.

`manifest.json` 예시:
```json
"ine": { "file": "ine.png", "anchorX": 0.45, "facing": "right", "scale": 1,
         "face": [0.15, 0.04, 0.55, 0.5], "tip": [0.82, 0.36], "fxColor": "#c58bff" }
```

> 프레임 시트(`--attack --frames N --grid CxR`)도 기술적으로는 지원하지만, 기본으로는 쓰지 않는다.
