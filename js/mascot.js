/*
 * 직장의 숲 · 캐릭터 공방 — mascot.js
 * "도토리 팀장": an original round squirrel NPC with an acorn-cap hat and a tiny
 * green necktie (inline SVG with soft gradients), plus the typewriter dialogue
 * box and all of the NPC's lines.
 */

/* ============================================================== mascot svg */
/**
 * mascotSVG({ id, crop, prop })
 *   id:   unique prefix for <defs> ids (several mascots can live on one page)
 *   crop: 'full' (default) | 'bust' (head + shoulders, for round portraits) | 'head'
 *   prop: 'clipboard' adds a little clipboard in the paws
 *   mood: bake ONE mood in (no CSS needed; for rasterizing to canvas). Omit in the page.
 * Moods are switched with CSS on an ancestor: [data-mood="happy" | "wow" | "wink"].
 * Talking (mouth flaps) with an ancestor .talking class.
 */
export function mascotSVG(o) {
  o = o || {};
  const p = o.id || 'm' + Math.random().toString(36).slice(2, 7);
  const vb = o.crop === 'head' ? '32 0 136 136' : o.crop === 'bust' ? '16 0 168 168' : '0 0 200 214';
  const u = (n) => `url(#${p}-${n})`;
  const clip = o.prop === 'clipboard';
  const baked = o.mood || null;
  const keep = (m) => !baked || baked === m;
  const showStyle = baked ? ' style="display:inline"' : '';
  return `<svg class="mascot-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" aria-hidden="true" focusable="false">
<defs>
  <radialGradient id="${p}-fur" cx="36%" cy="28%" r="78%"><stop offset="0" stop-color="#ffd3a1"/><stop offset=".5" stop-color="#e8975a"/><stop offset="1" stop-color="#b8642f"/></radialGradient>
  <radialGradient id="${p}-body" cx="40%" cy="22%" r="85%"><stop offset="0" stop-color="#f8bd85"/><stop offset=".6" stop-color="#e08c4f"/><stop offset="1" stop-color="#ad5c2a"/></radialGradient>
  <radialGradient id="${p}-tail" cx="34%" cy="30%" r="80%"><stop offset="0" stop-color="#ffd09b"/><stop offset=".55" stop-color="#df8e4c"/><stop offset="1" stop-color="#a65826"/></radialGradient>
  <radialGradient id="${p}-cream" cx="45%" cy="30%" r="75%"><stop offset="0" stop-color="#fffdf6"/><stop offset=".6" stop-color="#fdebd0"/><stop offset="1" stop-color="#f0cfa4"/></radialGradient>
  <radialGradient id="${p}-ear" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#ffc2c2"/><stop offset="1" stop-color="#ef9a8e"/></radialGradient>
  <linearGradient id="${p}-cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b47a45"/><stop offset=".6" stop-color="#8a5630"/><stop offset="1" stop-color="#6c3f20"/></linearGradient>
  <radialGradient id="${p}-capshine" cx="35%" cy="25%" r="55%"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <pattern id="${p}-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V8M0 0H8" stroke="#4d2a12" stroke-width="1.5" stroke-opacity=".32"/></pattern>
  <linearGradient id="${p}-tie" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fd28c"/><stop offset="1" stop-color="#3f8f4f"/></linearGradient>
  <radialGradient id="${p}-blush" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff8f8f" stop-opacity=".8"/><stop offset="1" stop-color="#ff8f8f" stop-opacity="0"/></radialGradient>
  <radialGradient id="${p}-eye" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="#6b4632"/><stop offset=".55" stop-color="#2a1810"/><stop offset="1" stop-color="#150b06"/></radialGradient>
  <radialGradient id="${p}-shadow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#5a3a1e" stop-opacity=".28"/><stop offset="1" stop-color="#5a3a1e" stop-opacity="0"/></radialGradient>
</defs>
<ellipse cx="102" cy="204" rx="66" ry="9" fill="${u('shadow')}"/>
<g class="m-tail">
  <path d="M124 186C162 192 196 162 192 120C189 84 166 56 138 58C114 60 106 84 120 98C130 108 148 98 158 108C170 122 160 150 136 156Z" fill="${u('tail')}"/>
  <path d="M168 84C178 98 182 116 178 134" fill="none" stroke="#ffe2bd" stroke-width="7" stroke-linecap="round" opacity=".55"/>
  <path d="M132 64C146 60 158 66 166 76" fill="none" stroke="#ffe2bd" stroke-width="5" stroke-linecap="round" opacity=".5"/>
</g>
<g class="m-body">
  <ellipse cx="80" cy="198" rx="17" ry="9" fill="#c4713a"/>
  <ellipse cx="124" cy="198" rx="17" ry="9" fill="#c4713a"/>
  <ellipse cx="102" cy="160" rx="47" ry="41" fill="${u('body')}"/>
  <ellipse cx="102" cy="170" rx="30" ry="28" fill="${u('cream')}"/>
  <path d="M84 128L102 142L92 152Z" fill="#fffaf2"/>
  <path d="M120 128L102 142L112 152Z" fill="#fffaf2"/>
  <path d="M97 139H107L105.5 147H98.5Z" fill="#3f8f4f"/>
  <path d="M98.5 147H105.5L111 170L102 180L93 170Z" fill="${u('tie')}"/>
  <path d="M100 152L104 152" stroke="#2f7a3e" stroke-width="2" stroke-linecap="round" opacity=".55"/>
  <path d="M97 162L107 158" stroke="#f6d04d" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>
</g>
${
  clip
    ? `<g class="m-clip">
  <rect x="112" y="150" width="40" height="48" rx="6" fill="#a8754a" transform="rotate(10 132 174)"/>
  <rect x="117" y="157" width="30" height="36" rx="3" fill="#fffaf0" transform="rotate(10 132 174)"/>
  <rect x="124" y="148" width="16" height="7" rx="3" fill="#7a8a99" transform="rotate(10 132 174)"/>
  <path d="M123 167h18M122 175h14M121 183h17" stroke="#d9c7a6" stroke-width="2.4" stroke-linecap="round" transform="rotate(10 132 174)"/>
  <path d="M138 179c5-6 11-6 13-3-4 5-9 6-13 3z" fill="#5bb36a" transform="rotate(10 132 174)"/>
</g>`
    : ''
}
<g class="m-paws">
  <ellipse cx="70" cy="164" rx="12" ry="15" fill="#d98549" transform="rotate(28 70 164)"/>
  <ellipse cx="${clip ? 118 : 134}" cy="${clip ? 172 : 164}" rx="${clip ? 10 : 12}" ry="${clip ? 12 : 15}" fill="#d98549" transform="rotate(${clip ? -20 : -28} ${clip ? 118 : 134} ${clip ? 172 : 164})"/>
</g>
<g class="m-head">
  <g class="m-ears">
    <path d="M52 66C40 44 46 22 58 18C70 16 80 34 82 52Z" fill="${u('fur')}"/>
    <path d="M57 58C51 44 54 31 60 28C66 28 71 40 72 50Z" fill="${u('ear')}"/>
    <path d="M148 66C160 44 154 22 142 18C130 16 120 34 118 52Z" fill="${u('fur')}"/>
    <path d="M143 58C149 44 146 31 140 28C134 28 129 40 128 50Z" fill="${u('ear')}"/>
    <path d="M58 19C55 12 58 6 63 5C62 10 64 14 62 19Z" fill="#c4713a"/>
    <path d="M142 19C145 12 142 6 137 5C138 10 136 14 138 19Z" fill="#c4713a"/>
  </g>
  <circle cx="100" cy="92" r="54" fill="${u('fur')}"/>
  <ellipse cx="100" cy="112" rx="33" ry="24" fill="${u('cream')}"/>
  <ellipse cx="70" cy="111" rx="12" ry="8" fill="${u('blush')}"/>
  <ellipse cx="130" cy="111" rx="12" ry="8" fill="${u('blush')}"/>
  ${keep('normal') ? `<g class="m-eyes m-eyes-normal"${showStyle}>
    <ellipse cx="80" cy="95" rx="8" ry="10" fill="${u('eye')}"/>
    <ellipse cx="120" cy="95" rx="8" ry="10" fill="${u('eye')}"/>
    <circle cx="77" cy="90.5" r="3.4" fill="#fff"/>
    <circle cx="117" cy="90.5" r="3.4" fill="#fff"/>
    <circle cx="83" cy="99.5" r="1.5" fill="#fff" opacity=".85"/>
    <circle cx="123" cy="99.5" r="1.5" fill="#fff" opacity=".85"/>
  </g>` : ''}
  ${keep('happy') ? `<g class="m-eyes m-eyes-happy"${showStyle} fill="none" stroke="#2a1810" stroke-width="5" stroke-linecap="round">
    <path d="M71 98Q80 86 89 98"/>
    <path d="M111 98Q120 86 129 98"/>
  </g>` : ''}
  ${keep('wow') ? `<g class="m-eyes m-eyes-wow"${showStyle}>
    <ellipse cx="80" cy="94" rx="10" ry="12" fill="${u('eye')}"/>
    <ellipse cx="120" cy="94" rx="10" ry="12" fill="${u('eye')}"/>
    <path d="M76 84l1.6 3.8 3.8 1.6-3.8 1.6L76 95l-1.6-4-3.8-1.6 3.8-1.6z" fill="#fff"/>
    <path d="M116 84l1.6 3.8 3.8 1.6-3.8 1.6L116 95l-1.6-4-3.8-1.6 3.8-1.6z" fill="#fff"/>
    <circle cx="84" cy="100" r="2" fill="#fff" opacity=".85"/>
    <circle cx="124" cy="100" r="2" fill="#fff" opacity=".85"/>
  </g>` : ''}
  ${keep('wink') ? `<g class="m-eyes m-eyes-wink"${showStyle}>
    <ellipse cx="80" cy="95" rx="8" ry="10" fill="${u('eye')}"/>
    <circle cx="77" cy="90.5" r="3.4" fill="#fff"/>
    <path d="M111 96Q120 102 129 96" fill="none" stroke="#2a1810" stroke-width="5" stroke-linecap="round"/>
  </g>` : ''}
  <path d="M93 103Q100 99.5 107 103Q105 109 100 110Q95 109 93 103Z" fill="#5a2f1c"/>
  <ellipse cx="98" cy="103" rx="2.4" ry="1.3" fill="#fff" opacity=".55"/>
  <g class="m-mouth m-mouth-closed">
    <path d="M100 110V113M91 113Q95.5 118 100 113Q104.5 118 109 113" fill="none" stroke="#5a2f1c" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="96.6" y="115.2" width="6.8" height="6.2" rx="1.8" fill="#fff" stroke="#d8bfa0" stroke-width="1"/>
    <path d="M100 115.6V121" stroke="#d8bfa0" stroke-width="1"/>
  </g>
  ${baked ? '' : `<g class="m-mouth m-mouth-open">
    <path d="M91 113Q100 112 109 113Q108 126 100 127Q92 126 91 113Z" fill="#7a2e22"/>
    <path d="M94 122Q100 118 106 122Q103 126.5 100 126.6Q97 126.5 94 122Z" fill="#f08a8a"/>
    <rect x="96.6" y="112.6" width="6.8" height="5.4" rx="1.6" fill="#fff"/>
  </g>`}
  <g class="m-cap" transform="rotate(-7 100 48)">
    <path d="M50 70C48 40 72 22 100 22C128 22 152 40 150 70C143 75 135 66 127 73C119 66 109 75 100 70C91 75 81 66 73 73C65 66 57 75 50 70Z" fill="${u('cap')}"/>
    <path d="M50 70C48 40 72 22 100 22C128 22 152 40 150 70C143 75 135 66 127 73C119 66 109 75 100 70C91 75 81 66 73 73C65 66 57 75 50 70Z" fill="${u('hatch')}"/>
    <path d="M50 70C48 40 72 22 100 22C128 22 152 40 150 70C143 75 135 66 127 73C119 66 109 75 100 70C91 75 81 66 73 73C65 66 57 75 50 70Z" fill="${u('capshine')}"/>
    <path d="M53 65C66 60 77 68 88 64C99 60 106 68 117 64C128 60 138 68 148 64" fill="none" stroke="#5c3418" stroke-width="2.5" stroke-linecap="round" opacity=".45"/>
    <path d="M100 24C99 14 103 7 111 4" fill="none" stroke="#6c3f20" stroke-width="6.5" stroke-linecap="round"/>
    <path d="M108 9C116 0 130 0 135 6C128 14 116 15 108 9Z" fill="#5bb36a"/>
    <path d="M110 9C118 7 125 6 132 6" fill="none" stroke="#3f8f4f" stroke-width="1.6" stroke-linecap="round"/>
  </g>
</g>
</svg>`;
}

/* ============================================================== text helpers */
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Korean particle chooser: josa('사원', '이', '가') -> '사원이' */
export function josa(word, withFinal, noFinal) {
  const w = String(word || '');
  const ch = w.charCodeAt(w.length - 1);
  if (!(ch >= 0xac00 && ch <= 0xd7a3)) return w + noFinal;
  const fin = (ch - 0xac00) % 28;
  // 으로/로: ㄹ batchim takes 로
  if (withFinal === '으로') return w + (fin === 0 || fin === 8 ? '로' : '으로');
  return w + (fin ? withFinal : noFinal);
}

/* ============================================================== lines */
export const LINES = {
  greet: [
    '어서 와요, 신입 사원님! 저는 인사 담당 도토리 팀장이에요. 오늘의 출근룩을 함께 골라봐요~',
    '반가워요! 숲속 최고의 회사에 입사한 걸 축하해요. 먼저 멋진 모습부터 만들어볼까요?',
  ],
  welcomeBack: ['다시 왔군요! 지난번 모습 그대로 기다리고 있었어요.', '오늘도 출근 도장 쾅! 이어서 꾸며볼까요?'],
  fromLink: ['친구가 보낸 캐릭터를 불러왔어요! 마음껏 따라 해봐요~', '링크 속 동료가 출근했어요! 반갑게 인사해볼까요?'],
  cat: {
    skin: ['피부톤 변경 완료! 얼굴에서 빛이 나요~', '오, 그 톤 아주 건강해 보여요!'],
    faceShape: ['얼굴형이 바뀌었어요! 말랑말랑 귀여워요~', '오, 그 얼굴형 사원증 사진이 잘 받겠는데요?'],
    bodyShape: ['체형 변경 완료! 어떤 모습이든 우리 숲의 일원이에요~', '오, 옷 태가 확 달라졌어요!'],
    hair: ['헤어 변신 완료! 오늘 출근룩 최고예요~', '그 머리 회의 시간에 인기 폭발이겠는데요?', '찰랑찰랑~ 미용실 다녀온 것 같아요!'],
    brows: ['눈썹 하나로 인상이 확 달라졌어요!', '표정이 살아났어요. 결재도 술술 받겠네요~'],
    eyes: ['반짝반짝! 눈빛에서 열정이 느껴져요.', '그 눈이라면 야근도 거뜬하겠어요… 아니, 칼퇴해요!'],
    nose: ['코 모양 변경! 숲 공기가 더 맛있어지겠네요.', '오, 귀여운 코예요. 킁킁!'],
    mouth: ['미소가 바뀌었어요! 웃는 얼굴이 최고의 복지죠~', '그 입매, 발표 때 자신감 뿜뿜이겠어요!'],
    cheeks: ['볼이 말랑말랑 귀여워졌어요!', '발그레~ 오늘 기분 좋은 일 있어요?'],
    top: ['상의 체인지! 오늘도 출근 준비 끝~', '그 옷 사무실에서 제일 눈에 띄겠어요!'],
    bottom: ['하의 변경 완료! 걸음걸이가 경쾌해졌어요.', '편하면서도 단정해요. 딱 좋아요!'],
    shoes: ['신발 좋네요! 숲길 출퇴근도 문제없겠어요.', '새 신발 신고 탕비실까지 달려볼까요?'],
    glasses: ['안경 쓰니까 일 잘하는 사원 느낌!', '시야가 반짝! 보고서 오타도 다 잡겠어요.'],
    hat: ['모자 장착! 머리 스타일링 시간 절약이에요~', '그 모자, 회식 자리 주인공 예약이에요!'],
    acc: ['소품 하나로 센스가 확 살아났어요!', '오, 그 소품 어디서 샀어요? 저도 갖고 싶어요!'],
    bg: ['배경도 바꿔봤어요. 기분 전환 완료!', '여기서 일하면 능률이 두 배겠는데요?'],
  },
  none: ['깔끔하게 비워봤어요. 심플한 것도 멋져요!', '없는 것도 스타일이죠~'],
  color: ['색을 바꾸니 분위기가 확 달라졌어요!', '이 색 찰떡이에요~', '오늘의 컬러 선정, 완벽해요!'],
  random: ['운명의 주사위! 두구두구… 짠!', '새로운 내가 나타났다! 마음에 들어요?', '랜덤 신입 등장! 오늘은 이 모습으로 출근?', '주사위 신이 이렇게 골라줬어요~'],
  undo: ['앗, 방금 건 없던 일로~', '한 걸음 뒤로! 괜찮아요, 원래 다 그런 거예요.'],
  redo: ['다시 앞으로! 역시 그게 나았죠?', '방금 그 모습, 다시 소환했어요!'],
  noUndo: ['더 되돌릴 게 없어요!'],
  noRedo: ['다시 할 게 없어요!'],
  reset: ['처음 모습으로 돌아왔어요. 새 출발!', '초기화 완료! 깨끗한 도화지 같아요.'],
  saved: ['도감에 저장했어요! 숲 인사기록부에 영원히~', '저장 완료! 도감에서 언제든 다시 불러올 수 있어요.'],
  savedAgain: ['이 모습은 이미 도감에 있어요! 맨 앞으로 꺼내 뒀어요.'],
  galleryFull: ['도감이 가득 찼어요(30명)! 몇 명을 정리하고 다시 저장해줘요.'],
  loaded: ['도감에서 불러왔어요! 다시 만나 반가워요~'],
  deleted: ['도감에서 정리했어요. 안녕~'],
  png: ['사진 찰칵! 프로필 사진으로 딱이에요.', '이미지로 저장했어요! 메신저 프사로 어때요?'],
  share: ['공유 링크를 복사했어요! 동료에게 자랑해봐요~'],
  shareManual: ['링크를 복사하지 못했어요. 아래 링크를 직접 복사해줘요!'],
  card: ['사원증 발급 완료! 이제 진짜 우리 숲 식구예요.', '쾅! 사원증이 나왔어요. 목에 걸고 출근해요~'],
  sound: { on: ['소리 켰어요! 뽀록뽀록~'], off: ['쉿, 조용히 꾸며볼게요.'] },
  tips: [
    '캐릭터를 드래그하면 빙글빙글 돌려볼 수 있어요.',
    '캐릭터를 더블클릭하면 한 바퀴 돌아요!',
    '키보드 ← → 로 옵션을, [ ] 로 탭을 바꿀 수 있어요.',
    'R 키를 누르면 랜덤 변신! 영감이 필요할 때 써봐요.',
    'Ctrl+Z (⌘Z) 로 되돌릴 수 있어요. 실수해도 괜찮아요~',
    '이름이랑 부서를 정하고 사원증을 발급받아 보세요!',
    '마음에 드는 모습은 도감에 저장해 두세요. 최대 30명까지!',
    '공유 링크를 보내면 친구도 똑같은 캐릭터를 볼 수 있어요.',
    '색상 동그라미를 눌러서 색을 바꿀 수 있어요.',
    '모자를 쓰면 머리 모양이 살짝 눌릴 수도 있어요. 모자의 숙명이죠~',
  ],
};

/* ============================================================== dialogue box */
/**
 * Typewriter speech bubble.
 *   new Dialogue({ textEl, boxEl, portraitEl, onBlip, reduced })
 *   say(text, { mood })   mood: 'happy' | 'wow' | 'wink' | 'normal'
 *   finish()              complete the current line instantly
 */
export class Dialogue {
  constructor(o) {
    this.textEl = o.textEl;
    this.boxEl = o.boxEl || o.textEl;
    this.portraitEl = o.portraitEl;
    this.onBlip = o.onBlip || (() => {});
    this.reduced = !!o.reduced;
    this.speed = o.speed || 28;
    this.timer = null;
    this.full = '';
    this.i = 0;
    this.done = true;
    this.typed = document.createElement('span');
    this.typed.className = 'typed';
    this.rest = document.createElement('span');
    this.rest.className = 'rest';
    this.rest.setAttribute('aria-hidden', 'true');
    this.textEl.replaceChildren(this.typed, this.rest);
  }

  say(text, opts) {
    opts = opts || {};
    clearInterval(this.timer);
    this.full = String(text || '');
    this.i = 0;
    this.done = false;
    if (this.portraitEl) this.portraitEl.dataset.mood = opts.mood || 'normal';
    this.boxEl.classList.remove('done');
    this.boxEl.classList.remove('bump');
    void this.boxEl.offsetWidth; // restart the bump animation
    this.boxEl.classList.add('bump');
    this.textEl.setAttribute('aria-label', this.full);
    if (this.reduced) {
      this.finish();
      return;
    }
    if (this.portraitEl) this.portraitEl.classList.add('talking');
    this.timer = setInterval(() => this._step(), this.speed);
    this._step();
  }

  _step() {
    if (this.i >= this.full.length) {
      this.finish();
      return;
    }
    const chars = Array.from(this.full);
    this.i = Math.min(chars.length, this.i + 1);
    const ch = chars[this.i - 1];
    this.typed.textContent = chars.slice(0, this.i).join('');
    this.rest.textContent = chars.slice(this.i).join('');
    if (ch && ch.trim() && this.i % 2 === 1) this.onBlip(ch.charCodeAt(0));
    if (this.i >= chars.length) this.finish();
  }

  finish() {
    clearInterval(this.timer);
    this.timer = null;
    this.typed.textContent = this.full;
    this.rest.textContent = '';
    this.i = this.full.length;
    this.done = true;
    this.boxEl.classList.add('done');
    if (this.portraitEl) this.portraitEl.classList.remove('talking');
  }
}
