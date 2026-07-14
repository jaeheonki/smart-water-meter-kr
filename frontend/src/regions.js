// 서버 지역 코드와 화면용 한글 지역명을 공유하는 매핑
export const REGION_LABELS = {
  seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천', gwangju: '광주',
  daejeon: '대전', ulsan: '울산', sejong: '세종', gyeonggi: '경기', gangwon: '강원',
  chungbuk: '충북', chungnam: '충남', jeonju: '전주', yeosu: '여수', pohang: '포항',
  changwon: '창원', jeju: '제주',
}

export function getRegionCode(label) {
  return Object.entries(REGION_LABELS).find(([, regionLabel]) => regionLabel === label)?.[0]
}
