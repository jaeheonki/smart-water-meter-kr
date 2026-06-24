# EC2 배포 가이드

## 사전 준비

- AWS 계정
- GitHub Personal Access Token (repo 권한)
- 로컬에 `.pem` 키 파일

---

## 1. EC2 인스턴스 생성

AWS 콘솔 → EC2 → 인스턴스 시작

| 항목 | 설정 |
|---|---|
| OS | Ubuntu 22.04 LTS |
| 인스턴스 유형 | t2.micro (Free tier) |
| 키 페어 | 새로 생성 → .pem 다운로드 |

**보안 그룹 인바운드 규칙**

| 유형 | 포트 | 소스 |
|---|---|---|
| SSH | 22 | 내 IP |
| 사용자 지정 TCP | 8000 | 0.0.0.0/0 |

---

## 2. .pem 파일 권한 설정 (Windows PowerShell)

```powershell
icacls "C:\path\to\jae.pem" /inheritance:r
icacls "C:\path\to\jae.pem" /grant:r "$($env:USERNAME):(R)"
```

---

## 3. EC2 접속

```powershell
ssh -i "jae.pem" ubuntu@<퍼블릭 IP>
```

처음 접속 시 `yes` 입력.

---

## 4. 서버 세팅

```bash
# uv 설치
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc

# 코드 clone (dev 브랜치)
git clone -b dev https://<GitHub토큰>@github.com/jaeheonki/smart-water-meter-kr.git
cd smart-water-meter-kr

# 의존성 설치 (개발용 패키지 제외)
uv sync --no-dev
```

---

## 5. 서버 실행 (백그라운드)

```bash
nohup uv run uvicorn src.api.main:app --host 0.0.0.0 --port 8000 &
```

터미널을 닫아도 서버가 유지된다.

**확인**
```bash
curl http://localhost:8000/regions
```

지역 목록이 나오면 성공.

---

## 6. 자주 쓰는 명령어

**서버 상태 확인**
```bash
ps aux | grep uvicorn
```

**서버 종료**
```bash
kill $(lsof -t -i:8000)
```

**서버 재시작**
```bash
kill $(lsof -t -i:8000)
nohup uv run uvicorn src.api.main:app --host 0.0.0.0 --port 8000 &
```

**코드 업데이트 후 재시작**
```bash
git pull origin dev
kill $(lsof -t -i:8000)
nohup uv run uvicorn src.api.main:app --host 0.0.0.0 --port 8000 &
```

**로그 확인**
```bash
tail -f nohup.out
```

---

## 주의사항

- `weights/` 폴더: YOLO 모델이 첫 요청 시 Google Drive에서 자동 다운로드됨 (수백MB, 시간 소요)
- `data/data.db`: SQLite DB. EC2 인스턴스 삭제 시 데이터도 사라짐. 중요 데이터는 별도 백업 필요.
- Free tier는 12개월 무료. 이후 요금 발생.
