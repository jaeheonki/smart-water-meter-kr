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

## 5. Docker로 서버 실행

**Docker 설치 및 권한 설정**

```bash
sudo apt-get update
sudo apt-get install -y docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
docker --version
exit
```

`ubuntu` 사용자의 Docker 그룹 권한을 적용하려면 SSH로 다시 접속한다. 현재 서버에서 확인한 버전은 Docker 29.1.3이다.

**기존 8000번 서버 정리 및 배포 브랜치 갱신**

```bash
kill $(lsof -t -i:8000) || true
cd ~/smart-water-meter-kr
git fetch origin
git switch feature_app_merge
git pull --ff-only origin feature_app_merge
git rev-parse --short HEAD
```

배포에 사용한 `feature_app_merge` HEAD는 `447efb1`이다.

**이미지 빌드 및 컨테이너 실행**

```bash
mkdir -p ~/smart-water-meter-kr/weights ~/smart-water-meter-kr/data
docker build -t water-meter-api .
docker rm -f water-api 2>/dev/null || true
docker run -d \
  --name water-api \
  --restart unless-stopped \
  -p 8000:8000 \
  -v ~/smart-water-meter-kr/weights:/app/weights \
  -v ~/smart-water-meter-kr/data:/app/data \
  water-meter-api
```

`weights`와 `data`는 호스트에 남으므로 이미지나 컨테이너를 교체해도 유지된다.

---

## 6. 자주 쓰는 명령어

**컨테이너 상태 및 재시작 정책 확인**

```bash
docker ps --filter name=water-api
docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' water-api
```

재시작 정책은 `unless-stopped`여야 한다.

**내부·외부 헬스체크**

```bash
curl -fsS http://localhost:8000/health
curl -fsS http://13.53.120.64:8000/health
```

두 요청 모두 정상 응답하면 배포가 완료된 것이다. 고정 접속 주소는 Elastic IP `13.53.120.64`이다.

**컨테이너 재시작**

```bash
docker restart water-api
```

**코드 업데이트 후 재시작**

```bash
cd ~/smart-water-meter-kr
git switch feature_app_merge
git pull --ff-only origin feature_app_merge
docker build -t water-meter-api .
docker rm -f water-api
docker run -d \
  --name water-api \
  --restart unless-stopped \
  -p 8000:8000 \
  -v ~/smart-water-meter-kr/weights:/app/weights \
  -v ~/smart-water-meter-kr/data:/app/data \
  water-meter-api
```

**로그 확인**

```bash
docker logs -f water-api
```

**재부팅 후 자동 복구 확인**

```bash
sudo reboot
# 약 2분 후 SSH로 다시 접속
docker ps --filter name=water-api
curl -fsS http://13.53.120.64:8000/health
```

`unless-stopped` 정책으로 서버 재부팅 후 약 2분 안에 `water-api`가 자동 복구된다.

---

## 주의사항

- `weights/` 폴더: YOLO 모델이 첫 요청 시 Google Drive에서 자동 다운로드됨 (수백MB, 시간 소요)
- `data/data.db`: SQLite DB. EC2 인스턴스 삭제 시 데이터도 사라짐. 중요 데이터는 별도 백업 필요.
- Free tier는 12개월 무료. 이후 요금 발생.
