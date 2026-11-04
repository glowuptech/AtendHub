"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  weekDays,
  rangeSlots,
  timeLabel,
  type Availability,
} from "../services/schedule";
export const shortDay = (day: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
export function AvailabilityEditor({
  value,
  onSave,
  onCancel,
}: {
  value: Availability;
  onSave: (v: Availability) => void;
  onCancel: () => void;
}) {
  const days = weekDays(value.week);
  const [defaultDuration, setDefaultDuration] = useState(value.defaultDuration),
    [displayStep, setDisplayStep] = useState(value.displayStep);
  const [slots, setSlots] = useState(() => new Set(value.slots)),
    [day, setDay] = useState(days[0]),
    [start, setStart] = useState("08:00"),
    [end, setEnd] = useState("17:00"),
    [error, setError] = useState("");
  function add() {
    try {
      const next = rangeSlots(day, start, end);
      setSlots((previous) => new Set([...previous, ...next]));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira os horários.");
    }
  }
  return (
    <section
      className="availability-editor"
      aria-label="Configurar disponibilidade"
    >
      <div className="section-caption">
        <div>
          <h2>Disponibilidade da semana</h2>
          <p className="muted">
            Liberar horários não cria agendamentos. Reservas existentes são
            preservadas.
          </p>
        </div>
        <Button variant="ghost" onClick={onCancel}>
          Fechar configuração
        </Button>
      </div>
      <div className="form-columns">
        <label>
          Duração padrão da consulta (minutos)
          <input
            type="number"
            min={1}
            max={480}
            value={defaultDuration}
            onChange={(e) => setDefaultDuration(Number(e.target.value))}
          />
        </label>
        <label>
          Intervalo visual da agenda (minutos)
          <input
            type="number"
            min={5}
            max={120}
            value={displayStep}
            onChange={(e) => setDisplayStep(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="availability-days">
        {days.map((d) => (
          <button key={d} aria-pressed={day === d} onClick={() => setDay(d)}>
            {shortDay(d)}
            <small>
              {[...slots].filter((s) => s.startsWith(d)).length} min liberados
            </small>
          </button>
        ))}
      </div>
      <div className="availability-range">
        <label>
          Início
          <input
            type="time"
            step={60}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          Fim
          <input
            type="time"
            step={60}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <Button variant="outline" onClick={add}>
          <Plus size={15} />
          Adicionar intervalo ao dia
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            setSlots(
              (previous) =>
                new Set([...previous].filter((s) => !s.startsWith(day))),
            )
          }
        >
          <Trash2 size={15} />
          Limpar dia
        </Button>
      </div>
      <details className="availability-single">
        <summary>Ajustar horário por horário — {shortDay(day)}</summary>
        <p>
          Marque ou desmarque blocos conforme o intervalo visual. Para 23h45 até
          meia-noite, use o último bloco.
        </p>
        <div>
          {Array.from(
            { length: Math.ceil(1440 / Math.max(5, displayStep)) },
            (_, i) => {
              const time = timeLabel(i * Math.max(5, displayStep)),
                key = `${day}T${time}`;
              return (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={slots.has(key)}
                    onChange={(e) =>
                      setSlots((previous) => {
                        const next = new Set(previous);
                        for (
                          let m = i * Math.max(5, displayStep);
                          m <
                          Math.min(1440, (i + 1) * Math.max(5, displayStep));
                          m++
                        ) {
                          const k = `${day}T${timeLabel(m)}`;
                          if (e.target.checked) next.add(k);
                          else next.delete(k);
                        }
                        return next;
                      })
                    }
                  />
                  {time}
                </label>
              );
            },
          )}
        </div>
      </details>
      <div className="availability-summary">
        {days.map((d) => {
          const values = [...slots].filter((s) => s.startsWith(d)).sort();
          const ranges: { from: number; to: number }[] = [];
          values.forEach((s) => {
            const n = Number(s.slice(11, 13)) * 60 + Number(s.slice(14));
            const last = ranges.at(-1);
            if (last && last.to === n) last.to = n + 1;
            else ranges.push({ from: n, to: n + 1 });
          });
          return (
            <div key={d}>
              <strong>{shortDay(d)}</strong>
              <span>
                {ranges.length
                  ? ranges
                      .map(
                        (r) =>
                          `${timeLabel(r.from)}–${r.to === 1440 ? "24:00" : timeLabel(r.to)}`,
                      )
                      .join(" · ")
                  : "Sem horários liberados"}
              </span>
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="actions">
        <Button
          onClick={() =>
            onSave({
              ...value,
              slots: [...slots],
              defaultDuration,
              displayStep,
            })
          }
        >
          Salvar disponibilidade
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
      <small>
        Esta configuração vale apenas para o profissional e a semana
        selecionados.
      </small>
    </section>
  );
}
