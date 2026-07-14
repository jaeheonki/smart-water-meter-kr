# 방울이_공유용.html(Claude 아티팩트 번들)에서 원본 프론트 소스(JSX)를 추출하는 스크립트
#
# ⚠️ 미검증 상태: 이 스크립트는 아직 실행 검증되지 않았다. Phase 0에서 반드시
#    실행 → 산출물 육안 확인 → 브라우저 렌더 확인까지 거칠 것 (설계 문서 Phase 0 참고).
#
# 배경:
#   Claude 아티팩트 "공유용 다운로드"는 원본 HTML을 <script type="__bundler/template">
#   블록 안에 JSON 문자열 이스케이프(\n, \", \/, \\) 형태로 보존한다.
#   이 블록을 언이스케이프하면 원본 아티팩트 HTML이 나오고, 그 안의
#   <script type="text/babel"> 블록이 원본 JSX 소스다.
#
# 사용법 (프로젝트 루트에서):
#   python scripts/extract_frontend_source.py "C:\Users\uj070\Downloads\방울이_공유용.html" extracted/
#
# 산출물:
#   extracted/template.html  — 복원된 원본 아티팩트 HTML 전체
#   extracted/app.jsx        — text/babel 블록에서 뽑은 JSX 소스 (여러 개면 app_2.jsx ...)

import io
import sys
from pathlib import Path

TEMPLATE_MARKER = '<script type="__bundler/template">'
BABEL_MARKER = '<script type="text/babel">'


def unescape_bundler(raw: str) -> str:
    """번들러가 적용한 JSON 문자열 이스케이프를 복원한다."""
    # 이중 백슬래시를 먼저 임시 문자로 치환해야 \n 복원과 충돌하지 않는다
    return (
        raw.replace("\\\\", "\x00")
        .replace("\\n", "\n")
        .replace('\\"', '"')
        .replace("\\/", "/")
        .replace("\x00", "\\")
    )


def main() -> None:
    if len(sys.argv) != 3:
        print("사용법: python scripts/extract_frontend_source.py <번들.html> <출력폴더>")
        sys.exit(1)

    src_path, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    with io.open(src_path, encoding="utf-8", errors="replace") as f:
        content = f.read()

    # 1) template 블록 경계 찾기
    #    블록 내부의 </script>는 <\/script>로 이스케이프되어 있으므로,
    #    시작점 이후 첫 번째 "진짜" </script>가 블록의 끝이다.
    t_start = content.find(TEMPLATE_MARKER)
    if t_start == -1:
        print("오류: __bundler/template 블록을 찾지 못함. 번들 형식이 다를 수 있음.")
        sys.exit(1)
    t_start += len(TEMPLATE_MARKER)
    t_end = content.find("</script>", t_start)

    template = unescape_bundler(content[t_start:t_end]).strip()
    tpl_path = out_dir / "template.html"
    tpl_path.write_text(template, encoding="utf-8")
    print(f"저장: {tpl_path} ({len(template):,}자)")

    # 2) 복원된 HTML에서 text/babel 블록(원본 JSX) 추출
    count = 0
    pos = 0
    while True:
        b_start = template.find(BABEL_MARKER, pos)
        if b_start == -1:
            break
        b_start += len(BABEL_MARKER)
        b_end = template.find("</script>", b_start)
        jsx = template[b_start:b_end].strip()
        count += 1
        name = "app.jsx" if count == 1 else f"app_{count}.jsx"
        jsx_path = out_dir / name
        jsx_path.write_text(jsx, encoding="utf-8")
        print(f"저장: {jsx_path} ({len(jsx):,}자)")
        pos = b_end

    if count == 0:
        print("경고: text/babel 블록을 찾지 못함. template.html을 직접 확인할 것.")
        sys.exit(1)
    print(f"완료: JSX 블록 {count}개 추출")


if __name__ == "__main__":
    main()
