/*
 * 직장의 숲 · 하루 — todo.js (today's to-do list on the office whiteboard)
 *
 * Each department has its own pool of tasks; three are picked per day, the same all day
 * and different the next (seeded by the date and the department). A department name
 * that is not in the list is matched by keyword (…개발…, …마케팅…), else a general pool.
 */

const POOLS = {
  개발: ['버그 잡기', '코드 리뷰', '배포 준비', '테스트 돌리기', '서버 점검', '새 기능 만들기', '문서 정리', '리팩터링', '로그 살펴보기', '스프린트 회의', '앱 속도 올리기', '도토리 API 손보기'],
  마케팅: ['SNS 글 올리기', '광고 문구 쓰기', '캠페인 회의', '포스터 검토', '설문 결과 정리', '이벤트 기획', '홍보 영상 확인', '경쟁사 조사', '뉴스레터 보내기', '브랜드 회의', '버섯 굿즈 기획'],
  인사: ['면접 일정 잡기', '신입 교육 준비', '급여 확인', '채용 공고 올리기', '휴가 신청 처리', '팀 회식 예약', '평가 면담', '복지 안내문 쓰기', '출근부 정리', '입사 서류 확인', '꿀 간식 주문'],
  디자인: ['시안 3개 그리기', '아이콘 다듬기', '색상 고르기', '디자인 리뷰', '배너 만들기', '폰트 정리', '로고 수정', '화면 설계', '일러스트 채색', '사용성 테스트', '잎사귀 패턴 그리기'],
  재무: ['영수증 정리', '예산 맞추기', '세금 계산', '월말 결산', '비용 승인', '도토리 장부 쓰기', '거래처 입금', '숫자 검산', '법인카드 정산', '감사 준비', '연못 예금 확인'],
  영업: ['고객 미팅', '견적서 보내기', '계약서 확인', '거래처 전화', '실적 보고', '새 고객 찾기', '제안서 쓰기', '출장 준비', '샘플 보내기', '감사 인사 돌리기', '숲속 지도 챙기기'],
  기획: ['기획서 쓰기', '일정표 짜기', '주간 회의', '아이디어 모으기', '도토리 숨기기', '시장 조사', '로드맵 정리', '보고서 검토', '목표 세우기', '회의실 예약', '겨울 계획 세우기'],
};
const GENERAL = ['메일 확인', '회의 참석', '보고서 쓰기', '서류 정리', '전화 돌리기', '도토리 줍기', '자료 조사', '책상 정리', '일정 확인', '업무 일지 쓰기'];

/** the task pool for a department name */
export function poolFor(dept) {
  const name = String(dept || '');
  const key = Object.keys(POOLS).find((k) => name.includes(k));
  return key ? POOLS[key] : GENERAL;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** today's tasks (n of them) for a department, on the local date of ms */
export function todosFor(dept, ms, n = 3) {
  const d = new Date(ms);
  const R = rng(hash(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}|${dept || ''}`));
  const pool = poolFor(dept).slice();
  for (let i = 0; i < n && i < pool.length; i++) {
    const j = i + Math.floor(R() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
