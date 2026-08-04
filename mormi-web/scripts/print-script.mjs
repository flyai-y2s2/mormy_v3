#!/usr/bin/env node
/*
 * print-script.mjs — 오개념 콘텐츠 통독(table read) 검수 도구
 *
 * 이 스크립트가 존재하는 이유: content/fractions.json 은 필드 단위로 보면 어느 하나도
 * 틀리지 않았는데, 아이가 실제로 겪는 순서대로 이어 읽으면 무너지는 결함이 생긴다.
 * 예컨대 '1에 가까운 분수' 단원은 "남은 것 = 피자 전체 / 먹은 것 = 조각 하나" 라는
 * 용어 계약 위에 서 있는데, 일반화 질문 한 줄에서만 "남은 조각" 이라고 부르는 순간
 * 아이 머릿속의 프레임이 갈라진다. 이런 결함은 필드를 따로따로 보는 grep 감사로는
 * 절대 안 잡히고, 사람이 처음부터 끝까지 소리 내어 읽어야만 걸린다. 그래서 이 도구는
 * 각 단원을 '수업 준비 → 첫 질문 → 사다리 되묻기 → 힌트 → 일반화 → 복창 → 숙제'라는
 * 실제 진행 순서로 펼쳐 낭독용 대본을 만들고, 끝에 붙은 미니 린터로 기계가 확실히
 * 잡을 수 있는 것(금칙어, 개념어 소실, 앞 대화 의존)만 따로 표시한다. 린터는 보조일
 * 뿐이고, 이 스크립트의 본체는 어디까지나 사람이 소리 내어 읽는 대본이다.
 *
 * 사용법: node scripts/print-script.mjs [단원id]   (인자 없으면 전 단원)
 * 종료 코드: 린터 위반이 하나라도 있으면 1.
 */

import { readFileSync } from 'node:fs';

const CONTENT_URL = new URL('../content/fractions.json', import.meta.url);

const LADDERS = ['3', '2', '1', '0'];
const LADDER_NOTE = {
  '3': '스스로 설명',
  '2': '빈칸 채우기',
  '1': '두 갈래 중 고르기',
  '0': '바로 고르기',
};

// ── 출력 헬퍼 ────────────────────────────────────────────────
const out = [];
const say = (line = '') => out.push(line);
const rule = (ch = '─', n = 60) => say(ch.repeat(n));

/** 값이 있으면 render(값)을, 없으면 누락 표시를 출력한다. */
function field(value, fieldName, render) {
  const empty =
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0);
  if (empty) {
    say(`⚠ 누락: ${fieldName}`);
    return false;
  }
  render(value);
  return true;
}

// ── 대본 출력 ────────────────────────────────────────────────
function printUnit(item, index, total) {
  say();
  rule('═');
  say(`단원 ${index + 1}/${total}  ${item.concept ?? '(개념명 없음)'}   [${item.id ?? 'id 없음'}]`);
  rule('═');

  field(item.concept, 'concept', () => {});
  field(item.misconception, 'misconception', (v) => say(`오개념   : ${v}`));
  field(item.generalized_target, 'generalized_target', (v) => say(`일반화목표: ${v}`));
  if (Array.isArray(item.keywords) && item.keywords.length) {
    say(`핵심어   : ${item.keywords.join(' / ')}`);
  }

  // 용어 계약 (있는 단원만)
  if (item.terms) {
    say();
    say('【용어 계약】 이 단원이 서 있는 말의 약속. 아래 대본 전체가 이 약속을 지켜야 한다.');
    for (const [k, v] of Object.entries(item.terms)) {
      const text = Array.isArray(v) ? v.join(' / ') : v;
      say(`  · ${k}: ${text}`);
    }
  }

  // 수업 준비 카드 (있는 단원만)
  if (item.prep) {
    say();
    say('【수업 준비 카드】 아이가 대화 전에 먼저 읽는 화면.');
    const lines = Array.isArray(item.prep) ? item.prep : [item.prep];
    lines.forEach((p, i) => say(`  ${i + 1}) ${p}`));
  }

  // 1. 첫 질문
  say();
  say('▶ 1. 첫 질문 — 모르미가 틀린 채로 먼저 말한다');
  field(item.mormi_wrong_try, 'mormi_wrong_try', (v) => say(`모르미│ ${v}`));

  // 2. 사다리 되묻기 3 → 2 → 1 → 0
  say();
  say('▶ 2. 사다리 되묻기 (아이가 막힐수록 3 → 2 → 1 → 0 으로 내려간다)');
  for (const L of LADDERS) {
    say();
    say(`  ── 사다리 ${L} · ${LADDER_NOTE[L]} ──`);
    const reask = item.reask_by_ladder?.[L];
    field(reask, `reask_by_ladder["${L}"]`, (v) => say(`  모르미│ ${v}`));

    const expected = item.expected_by_ladder?.[L];
    field(expected, `expected_by_ladder["${L}"]`, (v) => say(`  [기대답] ${v}`));

    const choices = item.choices_by_ladder?.[L];
    if (L === '3') {
      say('  [선택지] (없음 — 아이가 자기 말로 설명하는 단계)');
    } else {
      field(choices, `choices_by_ladder["${L}"]`, (v) => say(`  [선택지] ${v.join('  |  ')}`));
    }
  }

  // 3. 위장 힌트
  say();
  say('▶ 3. 위장 힌트 — 가르치지 않고, 모르미가 기억을 더듬는 척한다');
  field(item.hint, 'hint', (v) => say(`모르미│ ${v}`));

  // 4. 일반화
  say();
  say('▶ 4. 일반화 — 이 문제 하나를 규칙으로 끌어올린다');

  say();
  say('  [4-1] 탭 단계 (사다리 2)');
  field(item.generalize_by_ladder?.['2'], 'generalize_by_ladder["2"]', (v) => say(`  모르미│ ${v}`));
  field(item.generalize_choices_by_ladder?.['2'], 'generalize_choices_by_ladder["2"]', (v) =>
    say(`  [선택지] ${v.join('  |  ')}`),
  );
  field(item.generalize_choice_answer, 'generalize_choice_answer', (v) => say(`  [정답] ${v}`));

  say();
  say('  [4-2] 확정 문장 — 아이가 고른 뒤 화면에 남는 규칙');
  field(item.generalize_rule_line, 'generalize_rule_line', (v) => say(`  규칙 │ ${v}`));

  say();
  say('  [4-3] 설명 단계 (사다리 3)');
  field(item.generalize_by_ladder?.['3'], 'generalize_by_ladder["3"]', (v) => say(`  모르미│ ${v}`));

  say();
  say('  [4-4] 마중물 — 아이 입이 안 떨어질 때 앞부분만 대신 읽어준다');
  field(item.generalize_stem, 'generalize_stem', (v) => say(`  모르미│ ${v} …`));

  // 5. 복창
  say();
  say('▶ 5. 복창 — 모르미가 알아들었다는 걸 아이 말로 되돌려준다');
  field(item.correct_recap, 'correct_recap', (v) => say(`모르미│ ${v}`));

  // 6. 숙제
  say();
  say('▶ 6. 숙제 — 같은 오개념을 새 숫자로 한 번 더');
  const hw = item.homework;
  if (!hw) {
    say('⚠ 누락: homework');
  } else {
    field(hw.problem, 'homework.problem', (v) => say(`  문제  │ ${v}`));
    field(hw.mormi_wrong_try, 'homework.mormi_wrong_try', (v) => say(`  모르미│ ${v}`));
    field(hw.reask, 'homework.reask', (v) => say(`  모르미│ ${v}`));
    field(hw.choices, 'homework.choices', (v) => say(`  [선택지] ${v.join('  |  ')}`));
    field(hw.correct, 'homework.correct', (v) => say(`  [정답] ${v}`));
    field(hw.recap, 'homework.recap', (v) => say(`  모르미│ ${v}`));
  }
  say();
}

// ── 미니 린터 ────────────────────────────────────────────────

/** 객체를 훑어 모든 문자열을 {path, value} 로 모은다. skipKeys 아래는 건너뛴다. */
function collectStrings(node, path = '', skipKeys = new Set(), acc = []) {
  if (typeof node === 'string') {
    acc.push({ path: path || '(root)', value: node });
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => collectStrings(v, `${path}[${i}]`, skipKeys, acc));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (skipKeys.has(k)) continue;
      collectStrings(v, path ? `${path}.${k}` : k, skipKeys, acc);
    }
  }
  return acc;
}

/**
 * 금칙어 표기에서 실제로 찾을 문자열을 뽑아낸다.
 * "(단독으로 쓰는) 남은 조각" 처럼 앞에 조건이 괄호로 붙는 표기를 쓰므로,
 * 선행 괄호는 사람이 읽을 조건으로 보고 검색에서는 뒤의 실제 낱말만 쓴다.
 */
function bannedNeedle(entry) {
  return entry.replace(/^\s*\([^)]*\)\s*/, '').trim();
}

const METAPHOR_WORDS = ['피자'];
const CONCEPT_WORDS = ['분수', '수', '조각', '피자'];
const CARRYOVER_RE = /(^|[^라])(그럼 |아까 |그거 |그게 |이것도 )/;

function lintUnit(item) {
  const violations = [];
  const label = `${item.concept ?? '(개념명 없음)'} [${item.id ?? 'id 없음'}]`;

  // (a) 금칙어 — terms 선언 자체는 제외하고 단원의 모든 문자열 검사
  const banned = item.terms?.금칙;
  if (Array.isArray(banned) && banned.length) {
    const strings = collectStrings(item, '', new Set(['terms']));
    for (const entry of banned) {
      const needle = bannedNeedle(entry);
      if (!needle) continue;
      for (const { path, value } of strings) {
        if (value.includes(needle)) {
          violations.push({
            kind: '금칙어',
            level: '위반',
            path,
            detail: `금칙 "${entry}" → "${needle}" 가 그대로 쓰임`,
            value,
          });
        }
      }
    }
  }

  // (b) 일반화 질문에서 개념어가 통째로 사라졌는지
  const gvals = Object.entries(item.generalize_by_ladder ?? {});
  for (const [L, text] of gvals) {
    if (typeof text !== 'string') continue;
    if (!CONCEPT_WORDS.some((w) => text.includes(w))) {
      violations.push({
        kind: '개념어 소실',
        level: '경고',
        path: `generalize_by_ladder["${L}"]`,
        detail: `${CONCEPT_WORDS.join('·')} 중 아무 말도 안 나옴 — 무엇에 대한 규칙인지 사라졌을 수 있음`,
        value: text,
      });
    }
  }

  // (d) 궁금해 사전은 교과서의 말이어야 한다 — 우리가 만든 비유가 들어가면 안 된다.
  //     사전은 아이가 막혔을 때 소리 내어 읽는 '최후의 권위'다. 그 권위가 우리
  //     비유라면 아이는 교과 지식이 아니라 이 앱의 설명을 외우게 되고, 학교
  //     시험지에서 만날 언어와도 멀어진다. 비유는 모르미의 대화에만 산다.
  for (const [i, line] of (item.prep ?? []).entries()) {
    if (typeof line !== 'string') continue;
    const found = METAPHOR_WORDS.filter((w) => line.includes(w));
    if (found.length) {
      violations.push({
        kind: '사전에 비유',
        level: '위반',
        path: `prep[${i}]`,
        detail: `"${found.join('·')}" — 사전은 교과 언어로만 쓴다 (비유는 모르미 대화에서)`,
        value: line,
      });
    }
  }

  // (e) 탭 질문과 선택지가 이어지는지 — 잘 만들어진 탭 질문은 선택지 문구를
  //     질문 안에 미리 제시한다 ("A일까, B일까?" → [A, B]). 질문에 등장하지 않는
  //     어휘로 시작하는 선택지는 아이가 머릿속에서 다리를 놓아야 하므로 표시한다.
  //     활용 변형(커질까↔커진다)이 있어 어간 접두 매칭만 한다 — '의심' 수준.
  const tapPairs = [];
  for (const [L, q] of Object.entries(item.reask_by_ladder ?? {})) {
    const ch = item.choices_by_ladder?.[L];
    if (typeof q === 'string' && Array.isArray(ch)) {
      tapPairs.push([`reask_by_ladder["${L}"]`, q, ch]);
    }
  }
  {
    const gq = item.generalize_by_ladder?.['2'];
    const gc = item.generalize_choices_by_ladder?.['2'];
    if (typeof gq === 'string' && Array.isArray(gc)) {
      tapPairs.push(['generalize_by_ladder["2"]', gq, gc]);
    }
  }
  const connects = (question, choice) => {
    if (question.includes(choice)) return true; // 선택지가 질문에 그대로 등장
    // 낱말 단위: 분수 리터럴("2/4가")은 원문으로, 나머지는 어간 접두(2자, 짧으면 1자)로
    return choice
      .split(/\s+/)
      .some((tok) =>
        tok.includes('/')
          ? question.includes(tok)
          : question.includes(tok.slice(0, 2)) || question.includes(tok.slice(0, 1)),
      );
  };
  for (const [path, q, choices] of tapPairs) {
    if (q.includes('___')) continue; // 빈칸 채우기 — 선택지는 빈칸을 채우는 것
    const broken = choices.filter((c) => !connects(q, c));
    if (broken.length) {
      violations.push({
        kind: '질문·선택지 단절',
        level: '의심',
        path,
        detail: `질문에 없는 말로 답하는 선택지: ${broken.join(' | ')} — 질문 안에 선택지를 미리 제시할 것 ("A일까, B일까?")`,
        value: q,
      });
    }
  }

  // (f) 한 문장 한 프레임 — 탭 질문이 비유의 말(피자·조각)과 기호의 말(분수·숫자)을
  //     한 문장에 섞으면, 그 다리("아래 숫자가 작으면 조각이 크다")를 이미 아는
  //     사람만 이해할 수 있는 질문이 된다. 다리는 지금 가르치고 있는 내용이다.
  //     (1/3 같은 분수 리터럴은 두 프레임 모두의 '그 대상'이므로 기호어로 안 센다)
  const PIZZA_WORDS = ['피자', '조각'];
  const SYMBOL_WORDS = ['분수', '숫자', '위가', '위아래'];
  for (const [path, q] of tapPairs) {
    const pizza = PIZZA_WORDS.filter((w) => q.includes(w));
    const symbol = SYMBOL_WORDS.filter((w) => q.includes(w));
    if (pizza.length && symbol.length) {
      violations.push({
        kind: '프레임 혼합',
        level: '의심',
        path,
        detail: `비유의 말(${pizza.join('·')})과 기호의 말(${symbol.join('·')})이 한 문장에 — 한 문장 한 프레임`,
        value: q,
      });
    }
  }

  // (g) 탭 질문 길이 — 초3~4 저성취 아동이 한 번에 읽어낼 수 있어야 한다.
  for (const [path, q] of tapPairs) {
    const words = q.trim().split(/\s+/).length;
    if (words > 16) {
      violations.push({
        kind: '질문 과길이',
        level: '의심',
        path,
        detail: `${words}어절 — 16어절을 넘는 탭 질문은 나눠 쓰거나 줄일 것`,
        value: q,
      });
    }
  }

  // (c) 모르미가 먼저 던지는 말이 앞 대화에 기대고 있는지 (오탐 가능 — '의심'만)
  const carryTargets = [];
  if (typeof item.mormi_wrong_try === 'string') {
    carryTargets.push(['mormi_wrong_try', item.mormi_wrong_try]);
  }
  for (const [L, v] of Object.entries(item.reask_by_ladder ?? {})) {
    if (typeof v === 'string') carryTargets.push([`reask_by_ladder["${L}"]`, v]);
  }
  if (typeof item.homework?.mormi_wrong_try === 'string') {
    carryTargets.push(['homework.mormi_wrong_try', item.homework.mormi_wrong_try]);
  }
  if (typeof item.homework?.reask === 'string') {
    carryTargets.push(['homework.reask', item.homework.reask]);
  }
  for (const [path, text] of carryTargets) {
    const m = text.match(CARRYOVER_RE);
    if (m) {
      violations.push({
        kind: '앞 대화 의존 의심',
        level: '의심',
        path,
        detail: `"${m[2].trim()}" — 앞 대화를 이미 들었다고 가정한 말투일 수 있음 (오탐 가능)`,
        value: text,
      });
    }
  }

  return { label, violations };
}

// ── 실행 ─────────────────────────────────────────────────────
function main() {
  let data;
  try {
    data = JSON.parse(readFileSync(CONTENT_URL, 'utf8'));
  } catch (e) {
    console.error(`콘텐츠를 읽지 못했습니다: ${e.message}`);
    process.exit(1);
  }

  const wanted = process.argv[2];
  const all = Array.isArray(data.items) ? data.items : [];
  const items = wanted ? all.filter((it) => it.id === wanted) : all;

  if (wanted && items.length === 0) {
    console.error(`그런 단원이 없습니다: ${wanted}`);
    console.error(`있는 단원: ${all.map((it) => it.id).join(', ')}`);
    process.exit(1);
  }

  rule('═');
  say(`${data.unit ?? '(단원명 없음)'} · ${data.grade ?? ''} · ${data.standard ?? ''}`.trim());
  if (data.unit_summary) say(data.unit_summary);
  say(`통독 대본 — 단원 ${items.length}개${wanted ? ` (필터: ${wanted})` : ''}`);
  say('처음부터 소리 내어 읽으세요. 읽다가 걸리는 곳이 결함입니다.');
  rule('═');

  items.forEach((item, i) => printUnit(item, i, items.length));

  // 린터
  say();
  rule('═');
  say('미니 린터');
  rule('═');

  const results = items.map(lintUnit);
  const total = results.reduce((n, r) => n + r.violations.length, 0);

  if (total === 0) {
    say('걸린 것 없음. (린터가 조용하다고 대본이 매끄러운 건 아닙니다 — 낭독이 본체입니다.)');
  } else {
    for (const { label, violations } of results) {
      if (violations.length === 0) continue;
      say();
      say(`■ ${label}  — ${violations.length}건`);
      for (const v of violations) {
        say(`  [${v.level}] ${v.kind} @ ${v.path}`);
        say(`    ${v.detail}`);
        say(`    → ${v.value}`);
      }
    }
    say();
    say(`합계 ${total}건 (단원 ${results.filter((r) => r.violations.length).length}개).`);
  }
  say();

  console.log(out.join('\n'));
  process.exit(total > 0 ? 1 : 0);
}

main();
