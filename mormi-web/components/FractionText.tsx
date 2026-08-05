import { Fragment } from "react";

/** 2/3 같은 문자열을 교과서식 세로 분수로 보여준다. */
export function FractionText({ text }: { text: string }) {
  const matches = [...text.matchAll(/(\d+)\/(\d+)/g)];
  if (matches.length === 0) return <>{text}</>;

  let cursor = 0;
  return (
    <>
      {matches.map((match, index) => {
        const start = match.index ?? 0;
        const before = text.slice(cursor, start);
        cursor = start + match[0].length;
        return (
          <Fragment key={`${start}-${index}`}>
            {before}
            <StackedFraction numerator={match[1]} denominator={match[2]} />
            {index === matches.length - 1 ? text.slice(cursor) : null}
          </Fragment>
        );
      })}
    </>
  );
}

export function StackedFraction({
  numerator,
  denominator,
}: {
  numerator: string | number;
  denominator: string | number;
}) {
  return (
    <span
      className="stacked-fraction"
      role="img"
      aria-label={`${denominator}분의 ${numerator}`}
    >
      <span aria-hidden="true" className="stacked-fraction__top">{numerator}</span>
      <span aria-hidden="true" className="stacked-fraction__bottom">{denominator}</span>
    </span>
  );
}
