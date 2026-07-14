# 복구 UI 화면 인벤토리

이 문서는 `extracted/app.jsx` 2,748행 전체를 기준으로 작성한 Task 2 이식 전 인벤토리다. 원본 사본은 `../recovered/app.jsx.orig`에 보존하며 애플리케이션에서 import하지 않는다.

## 원본 구조

| 원본 구간 | 역할 | 주요 함수와 값 |
|---|---|---|
| 1~228행 | Android 데모 기기 프레임 | `AndroidStatusBar`, `AndroidAppBar`, `AndroidListItem`, `AndroidNavBar`, `AndroidDevice`, `AndroidKeyboard` |
| 229~772행 | 아티팩트 편집용 패널 | `useTweaks`, `TweaksPanel`, `Tweak*` 계열 |
| 773~1180행 | 디자인 토큰과 공용 UI | `BGC`, `MIcon`, `PhoneFrame`, `Card`, `PrimaryBtn`, `BottomNav` 등 |
| 1181~1497행 | 온보딩과 홈 | `Onboarding`, `ClosetSheet`, `HomeScreen` |
| 1498~1815행 | 계량기 입력 흐름 | `MeterFace`, `DialCol`, `CameraFlow` |
| 1816~2086행 | 사용 이력과 리포트 | `monthEntries`, `LedgerScreen`, `ReportScreen` |
| 2087~2395행 | 상점과 방 테마 | `SHOP_ITEMS`, `ROOM_THEMES`, `RoomThemeShop`, `ShopScreen` |
| 2396~2748행 | 설정, 모달, 앱 조립 | `DEFAULT_STATE`, `SettingsScreen`, `AttendanceModal`, `RegionModal`, `App` |

`PhoneFrame`도 412×892 고정 크기, 테두리, 상태바와 내비게이션 바를 포함하는 별도 데모 프레임이다. Step 4에서 Android 계열 컴포넌트와 함께 제거 대상이다. `Object.assign(window, ...)` 방식의 전역 export와 여러 `<script>` 및 HTML 닫기 태그도 ES module 이식 때 정리해야 한다.

## 화면과 대응 컴포넌트

| 화면 | 진입 조건과 전환 | 담당 함수 | 화면 내용과 상태 |
|---|---|---|---|
| 온보딩 1~4 | `st.onboarded === false`일 때 표시. 건너뛰기 또는 마지막 완료로 홈 이동 | `Onboarding` | 앱 소개, 물 절약과 에너지·탄소 설명, 방울이 수분 단계 설명, 가구원 수 선택과 일일 목표량 표시. 로컬 상태 `page`, `house` 사용 |
| 홈 | 기본 `screen: "home"` | `HomeScreen` | 사용자·방울이 이름, 가구원 수, 코인, 설정 진입, 방울이 수분 단계, 연속 기록, 절약 팁, 방 꾸미기 편집과 옷장 시트. 배치 아이템 위치 변경은 `DraggableDecor` 사용 |
| 옷장 바텀시트 | 홈의 옷 갈아입기 버튼 | `ClosetSheet` | 기본 외형 또는 보유 의상 장착, 상점 이동 |
| 촬영 뷰파인더 | 중앙 검침 버튼 또는 가계부의 오늘 기록 버튼으로 `screen: "camera"` | `CameraFlow`의 `step === "view"` | 가상 계량기, 촬영 버튼, 갤러리·플래시 모양 버튼, 사진 없이 직접 입력 진입 |
| 촬영 인식 중 | 뷰파인더 촬영 버튼 | `CameraFlow`의 `step === "scan"` | 가상 스캔 라인과 인식 중 문구. 1.6초 타이머 뒤 OCR 확인으로 자동 이동 |
| 수동 입력 | 뷰파인더의 직접 입력 또는 홈의 `onManual` 경로 | `CameraFlow`의 `step === "manual"` | 7자리 다이얼 입력, 전일 검침값 대비 사용량 계산, 0L 초과·5000L 미만 검증, 확정 버튼 |
| OCR 결과 확인·보정 | 스캔 완료 뒤 자동 진입 | `CameraFlow`의 `step === "confirm"` | 목 OCR 신뢰도 91%, 인식값 미리보기, 의심 자리 표시, 7자리 다이얼 보정, 재촬영 또는 확정 |
| 기록 완료 | 수동 입력 또는 OCR 보정 확정 | `CameraFlow`의 최종 반환 분기 | 사용량·목표·절약 또는 초과, 에너지·탄소 환산, 코인 보상 표시. 완료 시 홈으로 돌아가 `recorded`, `usage`, `coins` 갱신 |
| 물 가계부 | 하단 `ledger` 탭 | `LedgerScreen` | 주간은 최근 7일 막대그래프와 일별 기록·미기록 목록, 월간은 누적 사용·목표 달성 일수·평균과 달력형 현황. 설정에 따라 L 또는 지역 단가 기반 원화 표시 |
| 에너지 리포트 | 하단 `report` 탭 | `ReportScreen` | 주간·월간·연간·날짜 지정 필터, 기간 사용량, 에너지와 CO₂, 급탕·상수도·하수도 세부 환산, 휴대폰 충전·소나무 등가, 이전 기간 평균 비교 |
| 상점 | 하단 `shop` 탭 또는 옷장 시트 | `ShopScreen`, `RoomThemeShop` | 의상, 방 테마, 방 꾸미기 탭. 코인으로 구매, 의상 장착, 테마 적용, 소품 배치·해제 |
| 설정 | 홈 우측 설정 버튼으로 `screen: "settings"` | `SettingsScreen` | 사용자·방울이 이름, 글자 크기, 가계부 단위, 17개 지역, 온보딩 다시 보기 |
| 지역 선택 모달 | `regionSet === false` | `RegionModal` | 최초 지역 선택 후 `region`, `regionSet` 저장 |
| 출석 모달 | 온보딩·지역 설정 완료 후 당일 미출석 | `AttendanceModal` | 주간 출석 표시와 5코인 지급, `lastAttend` 갱신 |

하단 내비게이션은 `home`, `ledger`, `report`, `shop` 네 화면과 중앙 `camera` 버튼으로 구성된다. 설정은 하단 탭이 아니라 홈에서 진입한다.

## 목데이터와 계산 로직

`app.jsx`는 전역 `window.BG`를 소비하지만 그 정의를 포함하지 않는다. 정의는 Task 1 산출물 `extracted/template.html`의 일반 스크립트 5791~5866행에 남아 있다. Step 4에서 이 값을 누락하면 Vite 실행 시 `BG is not defined`가 발생한다.

| 목데이터 | 정의·사용처 | 내용 |
|---|---|---|
| `BG.SCENARIOS` | `template.html`, `App`, `CameraFlow` | 절약·보통·초과 시나리오별 가상 계량기 7자리 값과 사용량 |
| `BG.METER_YESTERDAY` | `template.html`, `CameraFlow` | 전일 누적 검침값 `234412`. 현재 다이얼 값에서 빼 오늘 사용량 계산 |
| `BG.HISTORY` | `template.html`, `LedgerScreen`, `ReportScreen` | 30개 숫자 배열에서 생성한 최근 30일 목 이력. `0`은 미기록 |
| `BG.GOAL_BY_HOUSEHOLD` | `template.html`, `Onboarding`, `App` | 1인 250L, 2인 380L, 3인 480L, 4인 이상 550L |
| `BG.STAGES` | `template.html`, `Onboarding`, `HomeScreen` | 방울이 수분 상태 5단계와 이미지·문구 |
| `BG.TIPS`, `BG.STREAK` | `template.html`, `App`, `HomeScreen` | 날짜 기반 절약 팁과 최근 연속 기록 일수 |
| `BG.energyOf`, `BG.COEF` | `template.html`, 촬영 완료·가계부·리포트 | 사용량을 급탕·상수도·하수도 에너지, CO₂, 휴대폰 충전 횟수로 환산 |
| `REGION_TARIFF` | `app.jsx` 2419행 | 서울 등 17개 지역의 L당 근사 단가. 설정과 가계부 금액 표시에 사용 |
| `SHOP_ITEMS` | `app.jsx` 2091행 | 의상 8종과 방 꾸미기 소품 24종의 id·가격·이미지·크기 |
| `ROOM_THEMES` | `app.jsx` 2137행 | 우드·그린·나이트·핑크 4개 방 테마와 가격·이미지·색상 |
| `TWEAK_DEFAULTS` | `app.jsx` 2400행 | 아티팩트 데모 패널의 사용량 시나리오와 방울이 단계. 실제 제품 UI가 아님 |

촬영 화면은 실제 카메라나 OCR을 호출하지 않는다. `MeterFace`로 목 계량기를 그리고 `setTimeout`으로 인식 완료를 흉내 내며, 갤러리와 플래시 버튼은 동작 핸들러가 없다. 홈의 오늘 물 가계부 카드 전체는 `{false && (...)}`로 비활성화되어 있다.

## localStorage 사용처

단일 키 `banguli_app_v1`에 앱 상태 전체를 JSON으로 저장한다.

| 위치 | 동작 |
|---|---|
| `loadState()` | 시작 시 키를 읽어 `DEFAULT_STATE`와 얕게 병합. 파싱 실패 시 기본 상태 사용 |
| `App`의 상태 저장 effect | `st`가 바뀔 때마다 상태 전체 저장 |
| `window.__replayOnboarding` | 코인·보유 아이템·장착 의상만 보존하고 나머지를 기본 상태로 되돌린 뒤 저장 |
| 데모 패널의 처음부터 버튼 | 위와 같은 부분 초기화 |
| 데모 패널의 완전 초기화 버튼 | 키 삭제 후 `DEFAULT_STATE` 적용 |

저장 필드는 `onboarded`, `screen`, `house`, `recorded`, `usage`, `coins`, `owned`, `equipped`, `placed`, `userName`, `dolphinName`, `fontScale`, `ledgerUnit`, `region`, `regionSet`, `lastAttend`, `decorPos`, `pendingEdit`, `room.theme`이다. 기본값에는 9,999코인, `rain` 의상과 `monstera` 소품 보유, `monstera` 배치가 포함되어 있어 모두 데모 상태다.

## Step 4 분리 후보

화면 경계를 그대로 유지하는 최소 분리안은 `Onboarding.jsx`, `HomeScreen.jsx`, `CameraFlow.jsx`, `LedgerScreen.jsx`, `ReportScreen.jsx`, `ShopScreen.jsx`, `SettingsScreen.jsx`다. `ClosetSheet`, `RegionModal`, `AttendanceModal`은 사용하는 주 화면과 함께 둘 수 있으며, 공용 UI와 목데이터는 별도 모듈로 옮겨야 한다. 이 파일명은 사용자 인벤토리 확인 뒤 확정한다.

## 연동 전 확인된 불일치

- `HomeScreen`은 `onManual`을 전달받지만 실제 버튼에서 사용하지 않으며, `App`의 연결값도 `camStart: "confirm"`이다. Task 2에서는 원본 동작을 임의 확장하지 않고, Task 6에서 촬영 화면의 기존 직접 입력 버튼이 `manual` 단계로 진입하도록 검증한다.
- 백엔드 지역 값은 `seoul`, `busan` 같은 영문 코드지만 원본 UI와 `REGION_TARIFF`는 `서울`, `부산` 같은 한글 표시명을 사용한다. Task 7에서 API 코드와 사용자 표시명 사이의 매핑을 추가한다.
- 별도 서버 오류 화면이나 요금 상세 화면은 추가하지 않는다. 네트워크 오류는 기존 화면의 안내·재시도 상태로 처리하고, 요금 상세는 기존 기록 완료 화면 안에 표시한다.
