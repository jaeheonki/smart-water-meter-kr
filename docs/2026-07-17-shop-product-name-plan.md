# 상점 상품명 교정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상점의 오탈자와 낯선 상품명 다섯 개를 승인된 표현으로 교정하고 `민트 스툴`은 유지한다.

**Architecture:** 기존 `SHOP_ITEMS` 배열의 표시용 `name`만 수정한다. 별도 데이터 구조나 라이브러리를 추가하지 않고 기존 Node 소스 계약 테스트로 문자열을 검증한다.

**Tech Stack:** React, JavaScript, Node 내장 테스트 러너, Vite.

## Global Constraints

- 상품 ID, 가격, 이미지 경로, 크기와 동작은 변경하지 않는다.
- `민트 스툴`은 그대로 유지한다.
- 새 라이브러리를 추가하지 않는다.

---

### Task 1: 상점 상품명 교정

**Files:**
- Modify: `frontend/tests/pre-capacitor-integration.test.mjs`
- Modify: `frontend/src/components/ShopScreen.jsx`

**Interfaces:**
- Consumes: `ShopScreen.jsx`가 내보내는 `SHOP_ITEMS` 배열.
- Produces: 교정된 화면 표시용 `name` 다섯 개와 유지되는 `민트 스툴`.

- [x] **Step 1: 실패하는 상품명 계약 테스트를 작성한다**

```javascript
test('상점 상품명은 오탈자와 낯선 표현을 교정한다', () => {
  for (const name of ['튤립 화분', '하트 쿠션', '원목 서랍장', '별빛 의자', '리본 가랜드', '민트 스툴']) {
    assert.match(shop, new RegExp(`name: ['"]${name}['"]`))
  }
  for (const name of ['튜립 화분', '하트 쿼션', '원목 서람장', '별빛 오토만', '리본 갈랜드']) {
    assert.doesNotMatch(shop, new RegExp(`name: ['"]${name}['"]`))
  }
})
```

- [x] **Step 2: 테스트가 기존 잘못된 상품명 때문에 실패하는지 확인한다**

Run: `node --test frontend/tests/pre-capacitor-integration.test.mjs`

Expected: 새 상품명 계약 테스트가 실패한다.

- [x] **Step 3: 표시용 상품명만 최소 변경한다**

```javascript
{ id: 'tulip', name: '튤립 화분', ... }
{ id: 'cushion', name: '하트 쿠션', ... }
{ id: 'dresser', name: '원목 서랍장', ... }
{ id: 'ottoman', name: '별빛 의자', ... }
{ id: 'garland', name: '리본 가랜드', ... }
```

- [x] **Step 4: 전체 프론트 테스트와 프로덕션 빌드를 검증한다**

Run: `node --test frontend/tests/notifications.test.mjs frontend/tests/pre-capacitor-integration.test.mjs frontend/tests/task7-integration.test.mjs`

Expected: 전체 Node 테스트가 통과한다.

Run: `npm run build`

Expected: Vite 프로덕션 빌드가 종료 코드 0으로 통과한다.

- [x] **Step 5: 상품명 변경을 커밋한다**

```bash
git add frontend/src/components/ShopScreen.jsx frontend/tests/pre-capacitor-integration.test.mjs
git commit -m "fix: 상점 상품명 오탈자 교정"
```
