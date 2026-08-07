import { Mormi } from "./Mormi";

export function LifeThemeHome({
  name,
  childName,
  busy,
  onCafe,
}: {
  name: string;
  childName: string;
  busy: boolean;
  onCafe: () => void;
}) {
  return (
    <section className="life-home" aria-labelledby="life-home-title">
      <div className="life-home__intro">
        <div className="life-home__speech">
          <span>{name}</span>
          <strong>{childName ? `${childName}, 오늘은 어디에 가 볼까?` : "오늘은 어디에 가 볼까?"}</strong>
          <p>생활 속 수학을 나와 같이 연습해 줘!</p>
        </div>
        <Mormi mood="happy" size={250} name={name} />
      </div>

      <div className="life-themes">
        <button className="life-theme life-theme--cafe" onClick={onCafe} disabled={busy}>
          <span className="life-theme__picture" aria-hidden="true">☕</span>
          <span className="life-theme__copy"><small>첫 번째 이야기</small><strong>카페에 가요</strong><span>메뉴를 고르고 돈을 내요</span></span>
          <span className="life-theme__go">시작</span>
        </button>
        <div className="life-theme life-theme--market is-coming" aria-disabled="true">
          <span className="life-theme__picture" aria-hidden="true">🛒</span>
          <span className="life-theme__copy"><small>다음 이야기</small><strong>장보러 가요</strong><span>가격을 보고 필요한 만큼 사요</span></span>
          <span className="life-theme__soon">곧 열려요</span>
        </div>
        <div className="life-theme life-theme--bus is-coming" aria-disabled="true">
          <span className="life-theme__picture" aria-hidden="true">🚌</span>
          <span className="life-theme__copy"><small>다음 이야기</small><strong>버스를 타요</strong><span>시간과 순서를 보고 이동해요</span></span>
          <span className="life-theme__soon">곧 열려요</span>
        </div>
      </div>
    </section>
  );
}

