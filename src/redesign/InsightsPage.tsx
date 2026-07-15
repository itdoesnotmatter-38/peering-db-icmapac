import React from "react";
import { useSnapshot } from "./Shell";
import { Bar } from "./bits";
import { fmtDate, fmtMonth } from "./data";

export default function InsightsPage() {
  const { derived } = useSnapshot();
  const { insights, latest, prev } = derived;

  return (
    <>
      <div className="rd-sec-head">
        <h2>
          {fmtMonth(latest)} {latest.slice(0, 4)} insights
        </h2>
        <span className="note rd-num">
          Computed from the {fmtDate(prev)} → {fmtDate(latest)} snapshots — refreshed after every month-end capture
        </span>
      </div>

      <div className="rd-igrid">
        {insights.map((card, i) => (
          <div className="rd-icard" key={i}>
            <span className={`rd-icat ${card.cat}`}>{card.catLabel}</span>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            {card.bars ? (
              <div className="rd-ibars">
                {card.bars.map((b, j) => (
                  <div className="rd-ibar" key={j}>
                    <span className="l">{b.label}</span>
                    <Bar pct={(b.value / (b.max || 1)) * 100} color={b.color} />
                    <span className="v rd-num">{b.text}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {card.list ? (
              <div className="rd-ilist">
                {card.list.map((r, j) => (
                  <div className="rd-irow" key={j}>
                    <span className="nm">{r.name}</span>
                    {r.sub ? <span className="as2 rd-num">{r.sub}</span> : null}
                    <span className={`amt rd-num${r.neg ? " neg" : ""}`}>{r.amount}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="rd-footnote">
        Insights are computed, not hand-written: each card is a rule over the last two monthly snapshots — biggest
        movers, largest presence gaps, concentration thresholds. New capture, new cards.
      </div>
    </>
  );
}
