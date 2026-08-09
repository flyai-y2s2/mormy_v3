"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { areaForSession, curriculumForSession, masteryTarget, mathAreas, sessions, transferTarget } from "./math-curriculum";
import type { Problem, Session, Visual } from "./morami-content";

type Expression = "calm" | "happy" | "confused" | "surprised" | "bright" | "celebrate";
type Stage = "curriculum" | "drill" | "teach" | "wrap" | "homework" | "complete";

const expressions: Record<Expression, string> = {
  calm: "/morami/calm-cutout.png",
  happy: "/morami/happy-cutout.png",
  confused: "/morami/confused-cutout.png",
  surprised: "/morami/surprised-cutout.png",
  bright: "/morami/bright-cutout.png",
  celebrate: "/morami/celebrate-cutout.png",
};

const stageLabels = ["혼자 연습", "가르치기", "별노트", "생활 게임"];

const areaImages: Record<string, string> = {
  "number-operations": "/math-areas/add-subtract.webp",
  "change-relations": "/math-areas/patterns.webp",
  "geometry-measurement": "/math-areas/measure-geometry.webp",
  "data-chance": "/math-areas/data-chance.webp",
};

type MoramiEvent = "session_start" | "drill_correct" | "drill_retry" | "teach_prompt" | "teach_correct" | "teach_retry" | "homework_correct" | "session_complete";

async function requestMoramiTurn(session: Session, event: MoramiEvent, fallbackDialogue: string, ladderLevel = 3) {
  try {
    const response = await fetch("/api/morami/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, event, ladderLevel, misconception: session.misconception, learnedLine: session.learnedLine, fallbackDialogue }),
    });
    if (!response.ok) return null;
    return await response.json() as { dialogue: string; expression: Expression; source: "openai" | "mock" };
  } catch {
    return null;
  }
}

function playLearningChime() {
  if (typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const notes = [659.25, 783.99, 1046.5];
  const now = context.currentTime;

  notes.forEach((frequency, index) => {
    const start = now + index * 0.11;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === notes.length - 1 ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.045, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.26);
  });

  window.setTimeout(() => void context.close(), 750);
}

type UiIconName = "sound" | "mute" | "book" | "star" | "sprout" | "bulb" | "sun" | "clip" | "bag" | "refresh";

function UiIcon({ name, size = "medium" }: { name: UiIconName; size?: "small" | "medium" | "large" }) {
  return <span className={`ui-icon ui-icon--${name} ui-icon--${size}`} aria-hidden="true"><i /></span>;
}

function Clock({ hour, minute, small = false }: { hour: number; minute: number; small?: boolean }) {
  const hourDegrees = hour * 30 + minute * 0.5;
  const minuteDegrees = minute * 6;
  return (
    <div className={`clock ${small ? "clock--small" : ""}`} aria-label={`${hour}시 ${minute}분 시계`}>
      {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((number, index) => (
        <span
          className="clock-number"
          key={number}
          style={{ "--angle": `${index * 30}deg` } as React.CSSProperties}
        >
          <b style={{ transform: `rotate(-${index * 30}deg)` }}>{number}</b>
        </span>
      ))}
      <i className="clock-hand clock-hand--hour" style={{ transform: `rotate(${hourDegrees}deg)` }} />
      <i className="clock-hand clock-hand--minute" style={{ transform: `rotate(${minuteDegrees}deg)` }} />
      <i className="clock-center" />
    </div>
  );
}

function PointingClock({ onPick, marker }: { onPick: (number: number) => void; marker: number }) {
  return (
    <div className={`point-clock point-clock--${marker}`} aria-label={`시계에서 숫자 ${marker}을 눌러 보세요`}>
      {[12, 3, 6, 9].map((number) => (
        <button key={number} className={`point-number point-number--${number}`} onClick={() => onPick(number)}>
          {number}
        </button>
      ))}
      <i className="point-hand" />
      <i className="clock-center" />
    </div>
  );
}

function ObjectGroup({ count, crossed = false }: { count: number; crossed?: boolean }) {
  return (
    <div className={`object-group ${crossed ? "is-crossed" : ""}`} aria-label={`${count}개`}>
      {Array.from({ length: count }, (_, index) => <i key={index} />)}
    </div>
  );
}

function MoneyVisual({ amounts, paid, labels = [] }: { amounts: number[]; paid?: number; labels?: string[] }) {
  return (
    <div className="money-visual">
      {paid && <div className="paid-card"><span>낸 돈</span><strong>{paid.toLocaleString("ko-KR")}원</strong></div>}
      <div className="price-row">
        {amounts.map((amount, index) => (
          <div className="price-card" key={`${amount}-${index}`}>
            <i className={amount >= 1000 ? "bill-shape" : "coin-shape"} />
            <span>{labels[index] || "돈"}</span>
            <strong>{amount.toLocaleString("ko-KR")}원</strong>
          </div>
        ))}
      </div>
      {paid && <div className="money-operation"><span>{paid.toLocaleString("ko-KR")}</span><b>−</b><span>{amounts.reduce((sum, value) => sum + value, 0).toLocaleString("ko-KR")}</span></div>}
    </div>
  );
}

function TenFrame({ count }: { count: number }) {
  return <div className="ten-frame" aria-label={`${count}개`}>{Array.from({ length: 10 }, (_, index) => <i key={index} className={index < count ? "is-filled" : ""} />)}</div>;
}

function GroupsVisual({ groups, each, mode }: { groups: number; each: number; mode: "multiply" | "share" }) {
  return <div className={`groups-visual groups-visual--${mode}`} aria-label={`${each}개씩 ${groups}묶음`}>{Array.from({ length: groups }, (_, group) => <span key={group}>{Array.from({ length: each }, (_, dot) => <i key={dot} />)}</span>)}</div>;
}

function NumberLineVisual({ start, end, marks, missing }: { start: number; end: number; marks: number[]; missing?: number }) {
  return <div className="number-line-visual" aria-label={`${start}부터 ${end}까지 수직선`}><div className="number-line-track" /><div className="number-line-marks">{marks.map((mark, index) => <span key={`${mark}-${index}`} className={mark === missing ? "is-focus" : ""}><i />{mark === missing ? "?" : mark}</span>)}</div></div>;
}

function MeasurementVisual({ kind, left, right, unit }: { kind: "length" | "weight" | "capacity"; left: number; right?: number; unit: string }) {
  const max = Math.max(left, right || left, 1);
  return <div className={`measurement-visual measurement-visual--${kind}`}>{[left, right].filter((value): value is number => typeof value === "number").map((value, index) => <div key={`${value}-${index}`}><span style={{ "--measure": `${Math.max(18, (value / max) * 100)}%` } as React.CSSProperties}><i /></span><strong>{value.toLocaleString("ko-KR")}{unit}</strong></div>)}</div>;
}

function ShapesVisual({ shapes }: { shapes: Array<"circle" | "triangle" | "square" | "rectangle"> }) {
  return <div className="shapes-visual">{shapes.map((shape, index) => <span key={`${shape}-${index}`} className={shape}><i /></span>)}</div>;
}

function PatternVisual({ items, missingIndex }: { items: string[]; missingIndex: number }) {
  return <div className="pattern-visual">{items.map((entry, index) => <span key={`${entry}-${index}`} className={index === missingIndex ? "is-missing" : ""}>{entry}</span>)}</div>;
}

function ChartVisual({ labels, values }: { labels: string[]; values: number[] }) {
  const max = Math.max(...values, 1);
  return <div className="chart-visual">{values.map((value, index) => <div key={`${labels[index]}-${index}`}><span><i style={{ height: `${(value / max) * 100}%` }} /></span><b>{value}</b><small>{labels[index]}</small></div>)}</div>;
}

function CalendarVisual({ month, highlight, note }: { month: number; highlight: number; note?: string }) {
  const days = month === 2 ? 28 : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return <div className="calendar-visual"><strong>{month}월</strong><div>{Array.from({ length: days }, (_, index) => <i key={index} className={index + 1 === highlight ? "is-highlight" : ""}>{index + 1}</i>)}</div>{note && <small>{note}</small>}</div>;
}

function LearningVisual({ visual, small = false }: { visual: Visual; small?: boolean }) {
  if (visual.type === "clock") return <Clock hour={visual.hour} minute={visual.minute} small={small} />;
  if (visual.type === "money") return <MoneyVisual amounts={visual.amounts} paid={visual.paid} labels={visual.labels} />;
  if (visual.type === "ten-frame") return <div className="ten-frame-pair"><TenFrame count={visual.count} />{typeof visual.secondCount === "number" && <TenFrame count={visual.secondCount} />}</div>;
  if (visual.type === "groups") return <GroupsVisual groups={visual.groups} each={visual.each} mode={visual.mode} />;
  if (visual.type === "number-line") return <NumberLineVisual start={visual.start} end={visual.end} marks={visual.marks} missing={visual.missing} />;
  if (visual.type === "measurement") return <MeasurementVisual kind={visual.kind} left={visual.left} right={visual.right} unit={visual.unit} />;
  if (visual.type === "shapes") return <ShapesVisual shapes={visual.shapes} />;
  if (visual.type === "pattern") return <PatternVisual items={visual.items} missingIndex={visual.missingIndex} />;
  if (visual.type === "chart") return <ChartVisual labels={visual.labels} values={visual.values} />;
  if (visual.type === "calendar") return <CalendarVisual month={visual.month} highlight={visual.highlight} note={visual.note} />;
  return (
    <div className={`math-visual ${small ? "math-visual--small" : ""}`}>
      {visual.type === "objects" ? <ObjectGroup count={visual.left} /> : <strong>{visual.left}</strong>}
      <b className="math-symbol">{visual.operation}</b>
      {visual.type === "objects" ? <ObjectGroup count={visual.right} crossed={visual.operation === "-"} /> : <strong>{visual.right}</strong>}
      <b className="math-symbol">=</b><span className="answer-cloud">?</span>
    </div>
  );
}

function ProblemCard({ problem, small = false }: { problem: Problem; small?: boolean }) {
  return <div className={`problem-visual ${small ? "problem-visual--small" : ""}`}><LearningVisual visual={problem.visual} small={small} /></div>;
}

function rotateAnswers(answers: string[], seed: number) {
  const offset = Math.abs(seed) % answers.length;
  return [...answers.slice(offset), ...answers.slice(0, offset)];
}

function shuffleWords(words: string[], seed: number) {
  const shuffled = [...words];
  let state = Math.abs(seed) + 1;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 9301 + 49297) % 233280;
    const target = state % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  if (shuffled.every((word, index) => word === words[index]) && shuffled.length > 1) shuffled.push(shuffled.shift()!);
  return shuffled;
}

function varyProblem(problem: Problem, seed: number): Problem {
  const step = Math.abs(seed % 4) + 1;
  if (problem.visual.type === "objects" || problem.visual.type === "equation") {
    const visual = problem.visual;
    const left = Math.max(2, visual.left + step);
    const right = visual.operation === "-" ? Math.max(1, Math.min(left - 1, visual.right + (step % 2))) : visual.right + (step % 3);
    const result = visual.operation === "+" ? left + right : left - right;
    return { ...problem, correct: String(result), answers: rotateAnswers([String(result), String(Math.max(0, result - 1)), String(result + 1)], seed), visual: { ...visual, left, right } };
  }
  if (problem.visual.type === "ten-frame") {
    if (problem.visual.secondCount !== undefined) {
      const relation = problem.correct;
      const low = 2 + (step % 3);
      const high = Math.min(10, low + 2 + (step % 2));
      const count = relation === "왼쪽" ? high : relation === "오른쪽" ? low : 4 + step;
      const secondCount = relation === "오른쪽" ? high : relation === "왼쪽" ? low : count;
      return { ...problem, visual: { ...problem.visual, count, secondCount } };
    }
    const count = ((problem.visual.count + step - 1) % 6) + 4;
    const suffix = problem.correct.replace(/[\d,\s-]/g, "");
    if (problem.prompt.includes("10")) {
      const result = 10 - count;
      const display = (value: number) => `${value}${suffix}`;
      const prompt = problem.prompt.includes("모으면") ? `${count}과 몇을 모으면 10일까?` : problem.prompt.includes("달걀판") ? `달걀판 10칸 중 ${count}칸을 채웠어. 몇 개가 더 필요할까?` : `10명 모둠에 ${count}명이 왔어. 몇 명이 더 와야 할까?`;
      return { ...problem, prompt, correct: display(result), answers: rotateAnswers([display(result), display(Math.max(0, result - 1)), display(result + 1)], seed), visual: { ...problem.visual, count } };
    }
    const display = (value: number) => `${value}${suffix}`;
    return { ...problem, correct: display(count), answers: rotateAnswers([display(count), display(Math.max(1, count - 1)), display(Math.min(10, count + 1))], seed), visual: { ...problem.visual, count } };
  }
  if (problem.visual.type === "money") {
    const amounts = problem.visual.amounts.map((amount, index) => amount + 100 * (((seed + index) % 3 + 3) % 3));
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    const paid = problem.visual.paid ? Math.max(total + 500, problem.visual.paid + step * 500) : undefined;
    const result = paid ? paid - total : total;
    const money = (value: number) => `${Math.max(0, value).toLocaleString("ko-KR")}원`;
    return {
      ...problem,
      prompt: paid ? `${paid.toLocaleString("ko-KR")}원을 냈어. 얼마를 돌려받을까?` : "모두 얼마일까?",
      correct: money(result),
      answers: rotateAnswers([money(result), money(result + 100), money(result >= 100 ? result - 100 : result + 200)], seed),
      visual: { ...problem.visual, amounts, paid },
    };
  }
  if (problem.visual.type === "clock") {
    const hour = ((problem.visual.hour + step - 1) % 12) + 1;
    const minute = problem.visual.minute;
    const correct = minute === 0 ? `${hour}시` : `${hour}시 ${minute}분`;
    const nextHour = hour === 12 ? 1 : hour + 1;
    return { ...problem, correct, answers: rotateAnswers([correct, minute === 0 ? `${hour}시 30분` : `${hour}시`, minute === 0 ? `${nextHour}시` : `${nextHour}시 ${minute}분`], seed), visual: { ...problem.visual, hour } };
  }
  return problem;
}

function shuffleProblemAnswers(problem: Problem, seed: number): Problem {
  const otherAnswers = problem.answers.filter((answer) => answer !== problem.correct);
  const answers = shuffleWords(otherAnswers, seed + 101);
  const correctPosition = Math.abs(seed) % (answers.length + 1);
  answers.splice(correctPosition, 0, problem.correct);
  return { ...problem, answers };
}

function extraLifeProblem(session: Session, seed: number): Problem {
  const n = Math.abs(seed % 4) + 2;
  if (session.subject === "number") return { prompt: "과일 바구니에 담긴 사과는 모두 몇 개일까?", answers: [String(n + 3), String(n + 2), String(n + 4)], correct: String(n + 3), visual: { type: "ten-frame", count: n + 3 } };
  if (session.subject === "addition") return { prompt: `오전에 ${n}개, 오후에 ${n + 2}개를 진열했어. 모두 몇 개일까?`, answers: [String(n * 2 + 2), String(n * 2 + 1), String(n * 2 + 3)], correct: String(n * 2 + 2), visual: { type: "objects", left: n, right: n + 2, operation: "+" } };
  if (session.subject === "subtraction") return { prompt: `빵 ${n + 6}개 중 ${n}개가 팔렸어. 몇 개 남았을까?`, answers: ["6", "5", "7"], correct: "6", visual: { type: "objects", left: n + 6, right: n, operation: "-" } };
  if (session.subject === "multiplication") return { prompt: `${n}개씩 든 상자가 3개야. 상품은 모두 몇 개일까?`, answers: [`${n * 3}개`, `${n + 3}개`, `${n * 2}개`], correct: `${n * 3}개`, visual: { type: "groups", groups: 3, each: n, mode: "multiply" } };
  if (session.subject === "division") return { prompt: `${n * 3}개를 3명에게 똑같이 포장해 줘. 한 명당 몇 개일까?`, answers: [`${n}개씩`, `${n + 1}개씩`, `${Math.max(1, n - 1)}개씩`], correct: `${n}개씩`, visual: { type: "groups", groups: 3, each: n, mode: "share" } };
  if (session.subject === "money") return { prompt: "카페에서 주스와 빵을 샀어. 모두 얼마일까?", answers: ["3,000원", "2,900원", "3,100원"], correct: "3,000원", visual: { type: "money", amounts: [1800, 1200], labels: ["주스", "빵"] } };
  if (session.subject === "clock") { const hour = n + 1; return { prompt: "공방 수업이 시작하는 시각은?", answers: [`${hour}시 30분`, `${hour}시`, `${hour + 1}시 30분`], correct: `${hour}시 30분`, visual: { type: "clock", hour, minute: 30 } }; }
  if (session.subject === "measurement") return { prompt: "공방에서 더 긴 리본을 골라 줘.", answers: ["A 리본", "B 리본", "길이가 같아"], correct: "A 리본", visual: { type: "measurement", kind: "length", left: n + 5, right: n + 2, unit: "cm" } };
  if (session.subject === "geometry") return { prompt: "축제 표지판에서 동그란 모양은 무엇일까?", answers: ["원", "삼각형", "사각형"], correct: "원", visual: { type: "shapes", shapes: ["circle", "triangle", "square"] } };
  if (session.subject === "pattern") return { prompt: "팔찌 장식의 다음 모양을 놓아 줘.", answers: ["●", "▲", "■"], correct: "●", visual: { type: "pattern", items: ["●", "▲", "●", "▲", "?"], missingIndex: 4 } };
  return { prompt: "축제 투표에서 가장 많은 표를 받은 간식은?", answers: ["주스", "빵", "과일"], correct: "주스", visual: { type: "chart", labels: ["주스", "빵", "과일"], values: [n + 5, n + 2, n + 3] } };
}

function answersMatch(input: string, correct: string) {
  const clean = (value: string) => value.replace(/[\s,._!?]/g, "").toLowerCase();
  if (clean(input) === clean(correct)) return true;
  const inputNumbers = input.match(/\d+/g)?.join("");
  const correctNumbers = correct.match(/\d+/g)?.join("");
  return Boolean(inputNumbers && correctNumbers && inputNumbers === correctNumbers);
}

type RecognitionResultLike = { results: { 0: { 0: { transcript: string } } } };
type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};
type RecognitionConstructor = new () => RecognitionLike;

type MissionScene = "cafe" | "market" | "workshop" | "fair";

const missionBackgrounds: Record<MissionScene, string> = {
  cafe: "/life-missions/cafe.webp",
  market: "/life-missions/market.webp",
  workshop: "/life-missions/workshop.webp",
  fair: "/life-missions/fair.webp",
};

function missionStory(session: Session): { scene: MissionScene; place: string; title: string; action: string } {
  if (session.subject === "money") return { scene: "cafe", place: "동네 카페", title: "손님의 주문을 계산해요", action: "계산대 답 누르기" };
  if (session.subject === "number") return { scene: "market", place: "과일 가게", title: "진열할 물건을 정확히 세어요", action: "바구니 답 고르기" };
  if (session.subject === "addition") return { scene: "market", place: "동네 가게", title: "두 장바구니를 합쳐 계산해요", action: "합계표 고르기" };
  if (session.subject === "subtraction") return { scene: "market", place: "동네 가게", title: "팔고 남은 물건을 확인해요", action: "남은 수 고르기" };
  if (session.subject === "multiplication") return { scene: "market", place: "상품 진열대", title: "같은 묶음을 빠르게 진열해요", action: "묶음표 고르기" };
  if (session.subject === "division") return { scene: "market", place: "포장 코너", title: "물건을 똑같이 나누어 포장해요", action: "포장 수 고르기" };
  if (session.subject === "clock") return session.id === "time-calendar"
    ? { scene: "workshop", place: "오늘의 일정판", title: "약속 날짜를 달력에서 찾아요", action: "일정 카드 고르기" }
    : { scene: "workshop", place: "공방 약속", title: "시계를 보고 시작 시간을 맞춰요", action: "시간표 고르기" };
  if (session.subject === "measurement") return { scene: "workshop", place: "만들기 공방", title: "재료를 직접 재서 골라요", action: "재료표 고르기" };
  if (session.subject === "geometry") return { scene: "workshop", place: "블록 공방", title: "모양과 위치를 보고 작품을 완성해요", action: "도면 조각 고르기" };
  if (session.subject === "pattern") return { scene: "fair", place: "축제 팔찌 부스", title: "규칙에 맞게 다음 장식을 놓아요", action: "다음 장식 고르기" };
  return session.id === "data-chance"
    ? { scene: "fair", place: "축제 뽑기 부스", title: "통 속 자료를 보고 결과를 예상해요", action: "예상표 고르기" }
    : { scene: "fair", place: "축제 투표 부스", title: "친구들의 표를 정리해 결과를 알려요", action: "결과판 고르기" };
}

function productImage(label: string, index: number) {
  if (/물|우유|주스/.test(label)) return "/life-missions/juice.webp";
  if (/빵|김밥|간식/.test(label)) return "/life-missions/bread.webp";
  return index % 2 === 0 ? "/life-missions/coffee.webp" : "/life-missions/bread.webp";
}

function CafeOrder({ problem }: { problem: Problem }) {
  if (problem.visual.type !== "money" || !problem.visual.labels?.length) return <div className="mission-prop mission-prop--register"><ProblemCard problem={problem} /></div>;
  return (
    <div className="cafe-order" aria-label="카페 주문 메뉴">
      {problem.visual.amounts.map((amount, index) => {
        const label = problem.visual.type === "money" ? problem.visual.labels?.[index] ?? `메뉴 ${index + 1}` : `메뉴 ${index + 1}`;
        return <div className="cafe-product" key={`${label}-${amount}`}><Image src={productImage(label, index)} alt={label} width={520} height={520} unoptimized /><span><b>{label}</b><strong>{amount.toLocaleString("ko-KR")}원</strong></span></div>;
      })}
      {problem.visual.paid && <div className="customer-money"><small>손님이 낸 돈</small><b>{problem.visual.paid.toLocaleString("ko-KR")}원</b></div>}
    </div>
  );
}

function LifeMissionGame({ session, problem, progress, solved, onAnswer, onFinish }: { session: Session; problem: Problem; progress: string; solved: boolean; onAnswer: (answer: string) => void; onFinish: () => void }) {
  const story = missionStory(session);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [showChoices, setShowChoices] = useState(false);
  useEffect(() => { setTypedAnswer(""); setShowChoices(false); }, [problem.prompt, progress]);
  return (
    <div className={`life-game life-game--${story.scene}`} style={{ "--mission-bg": `url(${missionBackgrounds[story.scene]})` } as React.CSSProperties}>
      <div className="life-game-shade" />
      <div className="mission-hud"><span>{story.place}</span><b>현장 미션 {progress}</b></div>
      <div className="mission-order"><small>오늘 할 일</small><h1>{solved ? "현장 미션 성공!" : story.title}</h1><p>{solved ? "배운 수학을 진짜 장면에서 써냈어요." : problem.prompt}</p></div>
      <div className="mission-playfield">
        {story.scene === "cafe" ? <CafeOrder problem={problem} /> : <div className={`mission-prop mission-prop--${story.scene}`}><ProblemCard problem={problem} /></div>}
      </div>
      {!solved ? <div className="mission-controls">
        <p>{story.action} · 먼저 직접 써 봐요</p>
        <form className="mission-write" onSubmit={(event) => { event.preventDefault(); if (typedAnswer.trim()) onAnswer(typedAnswer); }}>
          <input value={typedAnswer} onChange={(event) => setTypedAnswer(event.target.value)} placeholder="답을 직접 입력해요" aria-label="생활 미션 답 직접 입력" autoComplete="off" />
          <button type="submit" disabled={!typedAnswer.trim()}>확인</button>
        </form>
        <button type="button" className="choice-toggle" onClick={() => setShowChoices((value) => !value)}>{showChoices ? "보기 닫기" : "잘 모르겠어요 · 보기 열기"}</button>
        {showChoices && <div className="mission-choice-list">{problem.answers.map((answer) => <button key={answer} onClick={() => onAnswer(answer)}>{answer}</button>)}</div>}
      </div>
        : <button className="mission-finish" onClick={onFinish}>오늘 여행 마치기 <span className="button-arrow" /></button>}
    </div>
  );
}

function Morami({ expression, size = "large" }: { expression: Expression; size?: "large" | "small" }) {
  return (
    <div className={`morami-frame morami-frame--${size} morami-frame--${expression} ${expression === "happy" || expression === "celebrate" ? "is-bouncing" : ""}`}>
      <div className="morami-cutout">
        <Image key={expression} src={expressions[expression]} alt={`모르미 ${expression} 표정`} width={1254} height={1254} unoptimized priority={size === "large"} />
      </div>
      <span className="morami-shadow" />
    </div>
  );
}

function SpeechBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="speech-bubble">
      <div>{children}</div>
    </div>
  );
}

function Dictionary({ onClose, session }: { onClose: () => void; session: Session }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="궁금해 사전">
      <div className="dictionary-card">
        <div className="dictionary-tab"><UiIcon name="book" size="small" /> 궁금해 사전</div>
        <div className="dictionary-visual">
          <ProblemCard problem={session.dictionaryProblem} small />
          <div className="dictionary-lines">
            {session.dictionaryLines.map((line, index) => <p key={line}><i>{index + 1}</i>{line}</p>)}
          </div>
        </div>
        <button className="primary-button primary-button--purple" onClick={onClose}>다 읽었어!</button>
      </div>
    </div>
  );
}

export function MoramiApp() {
  const [sessionIndex, setSessionIndex] = useState(0);
  const [variantSeed, setVariantSeed] = useState(1);
  const activeSession = useMemo(() => {
    const base = sessions[sessionIndex];
    return {
      ...base,
      fillOptions: shuffleWords(base.fillOptions, variantSeed + sessionIndex * 43),
      oneWordOptions: shuffleWords(base.oneWordOptions, variantSeed + sessionIndex * 47),
      pointOptions: shuffleWords(base.pointOptions, variantSeed + sessionIndex * 53),
      sentenceWords: shuffleWords(base.sentenceWords, variantSeed + sessionIndex * 41),
      drills: base.drills.map((problem, index) => {
        const seed = variantSeed + index * 11;
        return shuffleProblemAnswers(varyProblem(problem, seed), seed);
      }),
    };
  }, [sessionIndex, variantSeed]);
  const [stage, setStage] = useState<Stage>("curriculum");
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [expression, setExpression] = useState<Expression>("happy");
  const [dialogue, setDialogue] = useState(sessions[0].memoryDialogue);
  const [soundOn, setSoundOn] = useState(true);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [drillIndex, setDrillIndex] = useState(0);
  const [drillCorrect, setDrillCorrect] = useState(0);
  const [drillAttempts, setDrillAttempts] = useState(0);
  const [drillFeedback, setDrillFeedback] = useState("");
  const [drillLocked, setDrillLocked] = useState(false);
  const [mastered, setMastered] = useState(false);
  const [ladder, setLadder] = useState(3);
  const [selectedWords, setSelectedWords] = useState<Array<{ id: string; word: string }>>([]);
  const [teachText, setTeachText] = useState("");
  const [speechStatus, setSpeechStatus] = useState("");
  const [teachSolved, setTeachSolved] = useState(false);
  const [solvedAtLevel, setSolvedAtLevel] = useState<number | null>(null);
  const [floorFails, setFloorFails] = useState(0);
  const [brightCarry, setBrightCarry] = useState(false);
  const [homeworkSolved, setHomeworkSolved] = useState(false);
  const [homeworkIndex, setHomeworkIndex] = useState(0);
  const [homeworkCorrect, setHomeworkCorrect] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [completedSessionIds, setCompletedSessionIds] = useState<string[]>([]);
  const startedAt = useRef(Date.now());
  const elapsedSeconds = useRef(0);

  const currentStep = stage === "curriculum" ? -1 : stage === "drill" ? 0 : stage === "teach" ? 1 : stage === "wrap" ? 2 : 3;
  const currentDrill = activeSession.drills[drillIndex % activeSession.drills.length];
  const homeworkBase = homeworkIndex < activeSession.homework.length ? activeSession.homework[homeworkIndex] : extraLifeProblem(activeSession, variantSeed + homeworkIndex * 17);
  const currentHomework = useMemo(() => {
    const seed = variantSeed + homeworkIndex * 29;
    return shuffleProblemAnswers(varyProblem(homeworkBase, seed), seed);
  }, [homeworkBase, homeworkIndex, variantSeed]);
  const activeArea = areaForSession(activeSession.id);
  const selectedArea = mathAreas.find((area) => area.id === selectedAreaId) ?? null;
  const sentenceBank = useMemo(() => activeSession.sentenceWords.map((word, index) => ({ id: `${variantSeed}-${sessionIndex}-${index}`, word })), [activeSession.sentenceWords, sessionIndex, variantSeed]);

  const askMorami = useCallback(async (event: MoramiEvent, fallbackDialogue: string, fallbackExpression: Expression, ladderLevel = ladder) => {
    setDialogue(fallbackDialogue);
    setExpression(fallbackExpression);
    const turn = await requestMoramiTurn(activeSession, event, fallbackDialogue, ladderLevel);
    if (turn) {
      setDialogue(turn.dialogue);
      setExpression(turn.expression);
    }
  }, [activeSession, ladder]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("morami-completed-sessions") || "[]") as string[];
      window.requestAnimationFrame(() => setCompletedSessionIds(saved));
    } catch { /* device-local progress is optional */ }
  }, []);

  useEffect(() => {
    if (stage === "curriculum") return;
    const timer = window.setInterval(() => {
      elapsedSeconds.current = Math.floor((Date.now() - startedAt.current) / 1000);
      if (elapsedSeconds.current >= 480 && !["wrap", "complete"].includes(stage)) {
        setTimedOut(true);
        setStage("wrap");
        setExpression("bright");
        setDialogue("오늘도 충분히 잘 가르쳐 줬어. 우리가 알아낸 걸 별노트에 적자!");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  const saveReport = useCallback((transfer: boolean) => {
    const report = {
      date: new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date()),
      repetitions: drillAttempts,
      masterySeconds: Math.max(54, elapsedSeconds.current),
      sessionId: activeSession.id,
      sessionTitle: activeSession.title,
      sessionUnit: activeSession.unit,
      sessionLevel: activeSession.level,
      masteryTarget,
      misconception: activeSession.misconception,
      learnedLine: activeSession.learnedLine,
      synchronized: floorFails > 0 || brightCarry,
      transfer,
      ladder: solvedAtLevel ?? 0,
      timedOut,
    };
    localStorage.setItem("morami-report", JSON.stringify(report));
    try {
      const previous = JSON.parse(localStorage.getItem("morami-report-history") || "[]") as unknown[];
      localStorage.setItem("morami-report-history", JSON.stringify([report, ...previous].slice(0, 8)));
    } catch {
      localStorage.setItem("morami-report-history", JSON.stringify([report]));
    }
  }, [activeSession, brightCarry, drillAttempts, floorFails, solvedAtLevel, timedOut]);

  function answerDrill(answer: string) {
    if (drillLocked || mastered) return;
    setDrillAttempts((count) => count + 1);
    if (answer === currentDrill.correct) {
      const nextCorrect = drillCorrect + 1;
      setDrillCorrect(nextCorrect);
      setDrillFeedback("한 번 더 익혔어!");
      setDrillLocked(true);
      window.setTimeout(() => {
        setDrillFeedback("");
        setDrillLocked(false);
        if (nextCorrect >= masteryTarget) {
          setMastered(true);
        } else {
          setDrillIndex((index) => index + 1);
        }
      }, 850);
    } else {
      setDrillFeedback("괜찮아. 그림을 천천히 다시 보자.");
    }
  }

  function beginTeaching() {
    setStage("teach");
    void askMorami("teach_prompt", activeSession.teachPrompt, "confused");
  }

  function lowerLadder(message: string) {
    setExpression("confused");
    setDialogue(message);
    setSelectedWords([]);
    if (ladder > 0) setLadder((level) => level - 1);
  }

  function solveTeaching(level: number) {
    setTeachSolved(true);
    setSolvedAtLevel(level);
    if (soundOn) playLearningChime();
    void askMorami("teach_correct", `아, 그렇구나! ${activeSession.learnedLine}`, "happy", level);
  }

  function checkSentence() {
    if (selectedWords.map((token) => token.word).join("|") === activeSession.targetSentence.join("|")) solveTeaching(3);
    else lowerLadder("앗, 내 말 속에 살짝 숨은 실수가 있나 봐. 빈칸으로 같이 볼까?");
  }

  function submitTeachText() {
    const response = teachText.trim();
    if (!response) return;
    const importantWords = [activeSession.fillCorrect, activeSession.oneWordCorrect, ...activeSession.targetSentence.filter((word) => word.length >= 2)];
    const matches = importantWords.filter((word) => response.includes(word)).length;
    if (matches >= 2 || response.includes(activeSession.fillCorrect)) {
      solveTeaching(3);
      setSpeechStatus("모르미가 내 설명을 들었어요!");
    } else {
      setSpeechStatus("중요한 말을 한 번 더 넣어 볼까요?");
      lowerLadder("설명해 줘서 고마워! 중요한 방법을 한마디 더 넣어 줄래?");
    }
  }

  function startSpeechInput() {
    const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechStatus("이 기기에서는 말하기 입력이 어려워요. 아래 칸에 직접 써 줘요.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setSpeechStatus("듣고 있어요… 천천히 말해 줘요.");
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setTeachText(transcript);
      setSpeechStatus("잘 들었어요! 문장을 확인하고 보내 줘요.");
    };
    recognition.onerror = () => setSpeechStatus("잘 듣지 못했어요. 다시 말하거나 직접 써 줘요.");
    recognition.onend = () => undefined;
    recognition.start();
  }

  function answerLadder(answer: string, correct: string) {
    if (answer === correct) {
      solveTeaching(ladder);
      return;
    }
    if (ladder > 0) {
      lowerLadder(ladder === 2 ? "거의 알 것 같아. 한 단어로 알려 줄래?" : "답을 직접 가리켜 줄래?");
    } else if (floorFails === 0) {
      setFloorFails(1);
      setExpression("confused");
      setDialogue("거의 알 것 같아. 궁금해 사전을 살짝 보고 다시 가리켜 보자!");
      setDictionaryOpen(true);
    } else {
      setBrightCarry(true);
      setExpression("bright");
      setDialogue("괜찮아! 오늘은 여기까지 같이 알아냈어. 내일 또 알려 줘!");
    }
  }

  function goWrap() {
    setStage("wrap");
    void askMorami("teach_correct", `${activeSession.learnedLine} 내가 이제 제대로 말했지?`, "happy");
  }

  function beginHomework() {
    if (timedOut) {
      finish(false);
      return;
    }
    setStage("homework");
    setHomeworkIndex(0);
    setHomeworkCorrect(0);
    void askMorami("teach_retry", "실생활 게임에서 막혔어. 장소를 둘러보며 세 문제를 같이 해결해 줄래?", "confused");
  }

  function answerHomework(answer: string) {
    if (answersMatch(answer, currentHomework.correct)) {
      const nextCorrect = homeworkCorrect + 1;
      setHomeworkCorrect(nextCorrect);
      if (nextCorrect >= transferTarget) {
        setHomeworkSolved(true);
        void askMorami("homework_correct", "우와, 진짜 생활 문제에도 쓸 수 있네! 덕분에 숙제 끝!", "celebrate");
        saveReport(true);
      } else {
        setHomeworkIndex((index) => index + 1);
        void askMorami("homework_correct", "하나 해결했어! 숫자가 달라진 것도 알려 줘.", "happy");
      }
    } else {
      setExpression("confused");
      setDialogue("아차, 문제에서 알려 준 것과 구할 것을 다시 나눠 볼까?");
    }
  }

  function finish(transfer = homeworkSolved) {
    saveReport(transfer);
    setCompletedSessionIds((current) => {
      const next = current.includes(activeSession.id) ? current : [...current, activeSession.id];
      localStorage.setItem("morami-completed-sessions", JSON.stringify(next));
      return next;
    });
    setStage("complete");
    void askMorami("session_complete", "오늘도 나를 가르쳐 줘서 고마워!", "celebrate");
  }

  function openSession(nextIndex: number) {
    setSessionIndex(nextIndex);
    setVariantSeed((seed) => seed + 97 + nextIndex * 13);
    setStage("drill");
    setExpression("calm");
    setDialogue("");
    setDictionaryOpen(false);
    setDrillIndex(0);
    setDrillCorrect(0);
    setDrillAttempts(0);
    setDrillFeedback("");
    setDrillLocked(false);
    setMastered(false);
    setLadder(3);
    setSelectedWords([]);
    setTeachText("");
    setSpeechStatus("");
    setTeachSolved(false);
    setSolvedAtLevel(null);
    setFloorFails(0);
    setBrightCarry(false);
    setHomeworkSolved(false);
    setHomeworkIndex(0);
    setHomeworkCorrect(0);
    setTimedOut(false);
    startedAt.current = Date.now();
    elapsedSeconds.current = 0;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startNextSession() {
    openSession((sessionIndex + 1) % sessions.length);
  }

  function showCurriculum() {
    setStage("curriculum");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showArea(areaId: string) {
    setSelectedAreaId(areaId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showAreaList() {
    setSelectedAreaId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const attribution = teachSolved && solvedAtLevel === 3 ? "지우가 알려줌" : "지우와 같이 공부함";

  return (
    <main className={`app-shell app-shell--${stage}`}>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="모르미 처음으로"><span>모</span> 모르미</Link>
        {stage === "curriculum" ? <div className="curriculum-tagline">2022 개정 수학과 교육과정 연계 · 내 속도로 이어가는 생활 수학</div> : <div className="progress-dots" aria-label={`학습 ${currentStep + 1}단계`}>
          {stageLabels.map((label, index) => <span key={label} className={index <= currentStep ? "is-active" : ""}><i />{label}</span>)}
        </div>}
        <div className="top-actions">
          <button className="round-control" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? "효과음 끄기" : "효과음 켜기"}><UiIcon name={soundOn ? "sound" : "mute"} size="small" /></button>
          {stage !== "curriculum" && <button className="curriculum-link" onClick={showCurriculum}>수학 과정</button>}
          <Link className="report-link" href="/report">어른 리포트 <span className="link-arrow" /></Link>
        </div>
      </header>

      {stage === "curriculum" && (
        <section className="curriculum-home">
          {!selectedArea ? (
            <>
              <div className="curriculum-hero">
                <div><p className="eyebrow">2022 개정 수학과 교육과정 연계</p><h1>오늘 배울<br /><em>수학 영역을 골라 봐요.</em></h1><p>교육부 수학과의 공식 4개 영역과 성취기준을 바탕으로, 기초 개념을 작은 단계와 실생활 게임으로 익혀요. 먼저 혼자 10번 연습한 뒤 모르미에게 가르칩니다.</p><div className="curriculum-summary"><strong>{mathAreas.length}<span>개 공식 영역</span></strong><strong>{sessions.length}<span>개 기초 과정</span></strong><strong>{completedSessionIds.length}<span>개 완료</span></strong></div></div>
                <Morami expression="bright" size="small" />
              </div>
              <div className="area-picker-heading"><p className="eyebrow">교육과정 4개 영역</p><h2>무엇을 공부할까요?</h2></div>
              <div className="math-area-grid">
                {mathAreas.map((area) => {
                  const done = area.sessionIds.filter((id) => completedSessionIds.includes(id)).length;
                  return (
                    <button className="math-area-card" key={area.id} style={{ "--area-color": area.color } as React.CSSProperties} onClick={() => showArea(area.id)}>
                      <div className="math-area-visual"><Image src={areaImages[area.id]} alt={`${area.title} 대단원을 나타내는 학습 그림`} width={640} height={640} unoptimized /><span>{done ? `${done}개 완료` : "1~6학년"}</span></div>
                      <div className="math-area-heading"><p>{area.title}</p><small>{area.description}</small></div>
                      <div className="math-area-footer"><span>3개 학년군 정규 범위</span><em>교육과정 보기 <b>›</b></em></div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="area-detail" style={{ "--area-color": selectedArea.color } as React.CSSProperties}>
              <button className="area-back" onClick={showAreaList}><span>‹</span> 4개 영역으로</button>
              <div className="area-detail-heading">
                <div className="area-detail-visual"><Image src={areaImages[selectedArea.id]} alt={`${selectedArea.title} 대단원을 나타내는 학습 그림`} width={640} height={640} unoptimized /><span>정규 영역</span></div>
                <div><p className="eyebrow">2022 개정 수학과 공식 영역</p><h1>{selectedArea.title}</h1><p>{selectedArea.description}</p></div>
              </div>
              <div className="grade-band-roadmap">
                {selectedArea.gradeBands.map((band) => <article key={band.label}><b>{band.label}</b><p>{band.topics}</p></article>)}
              </div>
              <div className="area-detail-label"><strong>지금 열려 있는 맞춤 연습</strong><span>{selectedArea.sessionIds.length}개 · 정규 범위를 작은 단계로 나눴어요</span></div>
              <div className="math-course-list math-course-list--detail">
                {selectedArea.sessionIds.map((id) => sessions.find((session) => session.id === id)).filter((session): session is Session => Boolean(session)).map((session) => {
                  const index = sessions.findIndex((candidate) => candidate.id === session.id);
                  const completed = completedSessionIds.includes(session.id);
                  const alignment = curriculumForSession(session);
                  return <button key={session.id} className={completed ? "is-complete" : ""} onClick={() => openSession(index)}><i>{completed ? "완료" : session.level}</i><span><b>{session.title}</b><small>{alignment.gradeBand} · {alignment.code} · {session.unit} {session.level}단계</small></span><em>시작</em></button>;
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {stage === "drill" && (
        <section className="scene scene--drill">
          <div className="drill-header">
            <div>
              <p className="eyebrow">{activeSession.unit} 탐험 · {Math.min(drillCorrect + 1, masteryTarget)}/{masteryTarget}</p>
              <h1>{mastered ? "준비 끝!" : currentDrill.prompt}</h1>
            </div>
            <div className="seed-meter" aria-label={`${drillCorrect}개 익힘`}>
              {Array.from({ length: masteryTarget }, (_, index) => <span key={index} className={index < drillCorrect ? "filled" : ""}>{index < drillCorrect ? <UiIcon name="sprout" size="small" /> : <i className="seed-empty" />}</span>)}
            </div>
          </div>
          <div className="drill-board drill-board--solo">
            {mastered ? (
              <div className="mastery-card">
                <div className="mastery-stars"><UiIcon name="star" size="large" /><UiIcon name="star" size="large" /><UiIcon name="star" size="large" /></div>
                <h2>10번 연습 끝!</h2>
                <p>이제 모르미가 처음 찾아올 거야.<br />방금 익힌 걸 네가 가르쳐 줘.</p>
                <button className="primary-button" onClick={beginTeaching}>모르미 가르치기 <span className="button-arrow" /></button>
                <button className="dictionary-link" onClick={() => setDictionaryOpen(true)}><UiIcon name="book" size="small" /> 먼저 사전 보기</button>
              </div>
            ) : (
              <div className="practice-card">
                <ProblemCard problem={currentDrill} />
                <div className="answer-grid">
                  {currentDrill.answers.map((answer) => (
                    <button key={answer} onClick={() => answerDrill(answer)} disabled={drillLocked}>{answer}</button>
                  ))}
                </div>
                <div className={`gentle-feedback ${drillFeedback ? "is-visible" : ""}`}>{drillFeedback || "빈 자리"}</div>
              </div>
            )}
          </div>
        </section>
      )}

      {stage === "teach" && (
        <section className="chat-scene">
          <div className="chat-title">
            <div><p className="eyebrow">내가 선생님!</p><h1>모르미의 생각을 고쳐 줘</h1></div>
            <button className="dictionary-pill" onClick={() => setDictionaryOpen(true)}><UiIcon name="book" size="small" /> 궁금해 사전</button>
          </div>
          <div className="chat-window">
            <div className="morami-chat-row">
              <Morami expression={expression} size="small" />
              <SpeechBubble><p>{dialogue}</p></SpeechBubble>
            </div>
            {!teachSolved && !brightCarry && (
              <div className="ladder-card">
                <div className="ladder-topline"><span>말하기 도움</span><div>{[0,1,2,3].map((n) => <i key={n} className={n <= ladder ? "on" : ""} />)}</div></div>
                <div className="teach-free-response">
                  <p><strong>내 말로 모르미에게 설명하기</strong><span>말하거나 직접 써도 돼요</span></p>
                  <textarea value={teachText} onChange={(event) => setTeachText(event.target.value)} placeholder="예: 더하기는 두 무리를 합치는 거야" rows={2} />
                  <div><button type="button" className="speech-button" onClick={startSpeechInput}>● 말로 알려주기</button><button type="button" className="send-teach-button" disabled={!teachText.trim()} onClick={submitTeachText}>모르미에게 보내기</button></div>
                  {speechStatus && <small>{speechStatus}</small>}
                </div>
                <div className="help-divider"><span>또는 도움 낱말로 알려주기</span></div>
                {ladder === 3 && (
                  <>
                    <p className="kid-prompt">낱말을 차례로 톡톡!</p>
                    <div className="sentence-tray">
                      {selectedWords.length ? selectedWords.map((token) => <button key={token.id} onClick={() => setSelectedWords((words) => words.filter((word) => word.id !== token.id))}>{token.word}</button>) : <span>여기에 문장을 만들어요</span>}
                    </div>
                    <div className="word-bank">
                      {sentenceBank.map((token) => <button key={token.id} disabled={selectedWords.some((word) => word.id === token.id)} onClick={() => setSelectedWords((words) => [...words, token])}>{token.word}</button>)}
                    </div>
                    <button className="check-button" disabled={selectedWords.length !== activeSession.targetSentence.length} onClick={checkSentence}>이렇게 알려 줄래!</button>
                  </>
                )}
                {ladder === 2 && (
                  <>
                    <p className="kid-prompt">빈칸에 들어갈 말은?</p>
                    <div className="fill-sentence">{activeSession.fillBefore} <b>?</b> {activeSession.fillAfter}</div>
                    <div className="choice-row">{activeSession.fillOptions.map((word) => <button key={word} onClick={() => answerLadder(word, activeSession.fillCorrect)}>{word}</button>)}</div>
                    <p className="disguise-hint"><UiIcon name="bulb" size="small" /> {activeSession.hint}</p>
                  </>
                )}
                {ladder === 1 && (
                  <>
                    <p className="kid-prompt">{activeSession.oneWordPrompt}</p>
                    <div className="choice-row">{activeSession.oneWordOptions.map((word) => <button key={word} onClick={() => answerLadder(word, activeSession.oneWordCorrect)}>{word}</button>)}</div>
                  </>
                )}
                {ladder === 0 && (
                  <>
                    <p className="kid-prompt">{activeSession.pointPrompt}</p>
                    {activeSession.pointClockMarker ? (
                      <PointingClock marker={activeSession.pointClockMarker} onPick={(number) => answerLadder(String(number), activeSession.pointCorrect)} />
                    ) : (
                      <div className="point-choice-grid">{activeSession.pointOptions.map((answer) => <button key={answer} onClick={() => answerLadder(answer, activeSession.pointCorrect)}>{answer}</button>)}</div>
                    )}
                    <p className="tap-hint">답을 톡 눌러서 알려 줘</p>
                  </>
                )}
              </div>
            )}
            {(teachSolved || brightCarry) && (
              <div className="learned-card">
                <UiIcon name={teachSolved ? "star" : "sun"} size="large" />
                <h2>{teachSolved ? "모르미가 이해했어!" : "오늘의 배움을 챙겼어!"}</h2>
                <p>{teachSolved ? "네가 알려 준 말로 다시 해 볼게." : "내일 다시 만나면 한 번 더 알려 줘."}</p>
                <button className="primary-button" onClick={goWrap}>별노트에 적기 <span className="button-arrow" /></button>
              </div>
            )}
          </div>
        </section>
      )}

      {stage === "wrap" && (
        <section className="scene scene--wrap">
          <div className="character-column"><Morami expression={expression} /></div>
          <div className="content-column">
            <SpeechBubble><p>{dialogue}</p></SpeechBubble>
            <article className="star-note">
              <div className="note-ring">별<br />노<br />트</div>
              <div className="note-content">
                <p><UiIcon name="star" size="small" /> 오늘 모르미가 배운 말</p>
                <h2>“<em>{activeSession.learnedLine}</em>”</h2>
                <span>{attribution}</span>
              </div>
            </article>
            <button className="primary-button" onClick={beginHomework}>{timedOut ? "오늘 마치기" : "숙제도 도와줄게"} <span className="button-arrow" /></button>
          </div>
        </section>
      )}

      {stage === "homework" && (
        <section className="scene scene--homework">
          <LifeMissionGame session={activeSession} problem={currentHomework} progress={`${Math.min(homeworkCorrect + 1, transferTarget)}/${transferTarget}`} solved={homeworkSolved} onAnswer={answerHomework} onFinish={() => finish(true)} />
          <div className="homework-morami"><Morami expression={expression} size="small" /><SpeechBubble><p>{dialogue}</p></SpeechBubble></div>
        </section>
      )}

      {stage === "complete" && (
        <section className="complete-scene">
          <div className="confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
          <Morami expression="celebrate" />
          <div className="complete-copy">
            <p className="eyebrow">오늘의 가르치기 완료</p>
            <h1>모르미가<br /><em>하나 더 알게 됐어!</em></h1>
            <div className="today-badges"><span><UiIcon name="sprout" size="small" /> {activeSession.title} {masteryTarget}번 연습</span><span><UiIcon name="star" size="small" /> 별노트 1개</span><span><UiIcon name="bag" size="small" /> 생활 미션 {transferTarget}개</span></div>
            <div className="session-roadmap" aria-label="단계별 학습 코스 목록">
              {(activeArea?.sessionIds || []).map((id) => sessions.find((session) => session.id === id)).filter((session): session is Session => Boolean(session)).map((session) => <span key={session.id} className={completedSessionIds.includes(session.id) || session.id === activeSession.id ? "is-done" : ""}><i />{session.title}</span>)}
            </div>
            {sessionIndex < sessions.length - 1 ? (
              <button className="primary-button" onClick={startNextSession}>다음: {sessions[sessionIndex + 1].title} <span className="button-arrow" /></button>
            ) : (
              <Link className="primary-button" href="/report">어른에게 보여 주기 <span className="button-arrow" /></Link>
            )}
            <button className="complete-report-link" onClick={showCurriculum}>다른 수학 과정 고르기</button>
            <Link className="complete-report-link" href="/report">오늘 기록 보기</Link>
          </div>
        </section>
      )}

      {dictionaryOpen && <Dictionary session={activeSession} onClose={() => setDictionaryOpen(false)} />}
    </main>
  );
}
