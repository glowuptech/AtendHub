import { useState } from "react";
import { Card } from "@/components/layout/shared";
import { daysBetween, shiftDay } from "@/lib/date-range";
import { displayNumber, money, percent } from "./format";
import type { MediaDay } from "./model";

const shortDate = (day: string) => day.slice(5).split("-").reverse().join("/");
const fullDate = (day: string) => day.split("-").reverse().join("/");
const compact = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function DailyChart({
  rows,
  range,
  currency,
}: {
  rows: MediaDay[];
  range: { from: string; to: string };
  currency: string;
}) {
  const [selected, setSelected] = useState("");
  const lookup = new Map(rows.map((row) => [row.day, row]));
  const days = Array.from(
    { length: daysBetween(range.from, range.to) + 1 },
    (_, index) => shiftDay(range.from, index),
  );
  const activeDay = days.includes(selected)
    ? selected
    : (rows.at(-1)?.day ?? days[0]);
  const active = lookup.get(activeDay);
  const left = 66,
    right = 572,
    top = 14,
    bottom = 172;
  const step = (right - left) / days.length;
  const x = (index: number) => left + step * (index + 0.5);
  const scale = (value: number, max: number) =>
    bottom - ((bottom - top) * value) / max;
  const leadsMax = Math.max(
    1,
    ...rows.flatMap((row) => [
      row.form_leads ?? 0,
      row.whatsapp_conversations ?? 0,
    ]),
  );
  const spendMax = Math.max(1, ...rows.map((row) => row.spend));
  const barWidth = Math.min(step * 0.35, 16);
  const tickStep = Math.max(1, Math.ceil((days.length - 1) / 5));
  let path = "";
  let connected = false;
  days.forEach((day, index) => {
    const row = lookup.get(day);
    if (row)
      path += `${connected ? "L" : "M"}${x(index)} ${scale(row.spend, spendMax)} `;
    connected = !!row;
  });
  const spendAxis = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const leadTicks = [
    ...new Set([
      0,
      Math.round(leadsMax / 3),
      Math.round((leadsMax * 2) / 3),
      leadsMax,
    ]),
  ];

  return (
    <Card title={`Visão temporal · ${currency}`}>
      <div className="paid-chart-legend">
        <span>
          <i className="paid-swatch paid-swatch-line" />
          Investimento
        </span>
        <span>
          <i className="paid-swatch paid-swatch-forms" />
          Formulários Meta
        </span>
        <span>
          <i className="paid-swatch paid-swatch-whatsapp" />
          Conversas no WhatsApp
        </span>
      </div>
      <svg
        className="paid-daily-chart"
        viewBox="0 0 616 200"
        role="img"
        aria-label={`Investimento e leads por dia de ${fullDate(range.from)} a ${fullDate(range.to)}`}
      >
        {Array.from({ length: 4 }, (_, index) => {
          const value = (spendMax * index) / 3;
          const y = scale(value, spendMax);
          return (
            <g key={index}>
              <line
                className="paid-chart-gridline"
                x1={left}
                y1={y}
                x2={right}
                y2={y}
              />
              <text x={left - 7} y={y + 4} textAnchor="end">
                {spendAxis.format(value)}
              </text>
            </g>
          );
        })}
        {leadTicks.map((value) => (
          <text key={value} x={right + 7} y={scale(value, leadsMax) + 4}>
            {compact.format(value)}
          </text>
        ))}
        {days.map((day, index) => {
          const row = lookup.get(day);
          return (
            <g key={day}>
              {day === activeDay && (
                <rect
                  className="paid-chart-highlight"
                  x={left + index * step}
                  y={top}
                  width={step}
                  height={bottom - top}
                  rx="2"
                />
              )}
              {row &&
                (["form_leads", "whatsapp_conversations"] as const).map(
                  (key, series) => {
                    const count = row[key];
                    if (!count) return null;
                    const y = scale(count, leadsMax);
                    return (
                      <rect
                        key={key}
                        className={
                          series ? "paid-fill-whatsapp" : "paid-fill-forms"
                        }
                        x={x(index) + (series - 1) * barWidth}
                        y={y}
                        width={barWidth}
                        height={bottom - y}
                      />
                    );
                  },
                )}
              {((index % tickStep === 0 &&
                index + tickStep < days.length - 1) ||
                index === days.length - 1 ||
                index === 0) && (
                <text x={x(index)} y={bottom + 17} textAnchor="middle">
                  {shortDate(day)}
                </text>
              )}
            </g>
          );
        })}
        <path className="paid-investment-line" d={path} />
        {days.map((day, index) => {
          const row = lookup.get(day);
          return (
            <g key={day}>
              {row &&
                (day === activeDay ||
                  (!lookup.has(days[index - 1]) &&
                    !lookup.has(days[index + 1]))) && (
                  <circle
                    className="paid-investment-point"
                    cx={x(index)}
                    cy={scale(row.spend, spendMax)}
                    r="3"
                  />
                )}
              <rect
                className="paid-chart-target"
                x={left + index * step}
                y={top}
                width={step}
                height={bottom - top}
                onPointerEnter={() => setSelected(day)}
                onClick={() => setSelected(day)}
              />
            </g>
          );
        })}
      </svg>
      <div className="paid-day-detail">
        <label>
          Dia no gráfico
          <select
            value={activeDay}
            onChange={(event) => setSelected(event.target.value)}
          >
            {days.map((day) => (
              <option key={day} value={day}>
                {fullDate(day)}
              </option>
            ))}
          </select>
        </label>
        <dl className="paid-day-values">
          <div>
            <dt>Investimento</dt>
            <dd>{money(active?.spend ?? null, currency)}</dd>
          </div>
          <div>
            <dt>Formulários</dt>
            <dd>{displayNumber(active?.form_leads ?? null)}</dd>
          </div>
          <div>
            <dt>WhatsApp</dt>
            <dd>{displayNumber(active?.whatsapp_conversations ?? null)}</dd>
          </div>
        </dl>
        {!active && (
          <p className="muted paid-day-missing">Dia sem dados importados.</p>
        )}
      </div>
    </Card>
  );
}

export type ChartDatum = { label: string; value: number };
const seriesColors = ["#634cdb", "#1a8d82", "#a656bb", "#dd9b36", "#5774ac"];
export function GenderChart({
  data,
  format,
}: {
  data: ChartDatum[];
  format: (value: number) => string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <p className="muted">Nenhum resultado neste recorte.</p>;
  let start = 0;
  const segments = [];
  for (const [index, { label, value }] of data.entries()) {
    const color = seriesColors[index % seriesColors.length];
    const share = (value / total) * 100;
    const from = start;
    start += share;
    segments.push({
      label,
      color,
      share,
      value,
      stop: `${color} ${from}% ${start}%`,
    });
  }
  return (
    <div className="paid-donut-layout">
      <div
        className="paid-donut"
        style={{
          backgroundImage: `conic-gradient(${segments.map((item) => item.stop).join(", ")})`,
        }}
        aria-hidden="true"
      >
        <strong>{format(total)}</strong>
      </div>
      <ul className="paid-segment-legend">
        {segments.map(({ label, value, color, share }) => (
          <li key={label}>
            <i className="paid-swatch" style={{ background: color }} />
            <span>{label}</span>
            <strong>{percent(share)}</strong>
            <span className="muted">{format(value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
export function SegmentBars({
  data,
  format,
  vertical = false,
}: {
  data: ChartDatum[];
  format: (value: number) => string;
  vertical?: boolean;
}) {
  const max = Math.max(0, ...data.map((item) => item.value));
  if (!max) return <p className="muted">Nenhum resultado neste recorte.</p>;
  return (
    <ul
      className={
        vertical ? "paid-segments-vertical" : "paid-segments-horizontal"
      }
    >
      {data.map(({ label, value }) => (
        <li key={label}>
          <span>{label}</span>
          <meter min={0} max={max} value={value} aria-label={label} />
          <strong>{format(value)}</strong>
        </li>
      ))}
    </ul>
  );
}
