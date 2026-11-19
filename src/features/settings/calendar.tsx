"use client";
import { startTransition, useEffect, useState } from "react";
import { useServiceCalendar } from "@/features/queue/use-service-calendar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/layout/shared";
import {
  CLAIM_TARGET_MINUTES,
  CalendarSchema,
  PersistedCalendarSchema,
} from "@/features/queue/calendar";
export function ServiceCalendar() {
  const {
    calendar,
    error: calendarError,
    isLoading,
    mutate,
  } = useServiceCalendar();
  const [draft, setDraft] = useState(calendar),
    [holidays, setHolidays] = useState(calendar.holidays.join("\n")),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    startTransition(() => {
      setDraft(calendar);
      setHolidays(calendar.holidays.join("\n"));
    });
  }, [calendar]);
  return (
    <>
      <div className="section-caption">
        <div>
          <h2>Calendário de atendimento</h2>
          <p>Defina quando a equipe atende e o prazo da fila é contado.</p>
        </div>
        <Badge>{draft.timezone}</Badge>
      </div>
      {isLoading && <p role="status">Carregando configuração persistida…</p>}
      {calendarError && (
        <p role="alert">Não foi possível carregar o calendário persistido.</p>
      )}
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving || isLoading || calendarError) return;
          const parsed = CalendarSchema.safeParse({
            ...draft,
            holidays: holidays
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
          });
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            setMessage("");
            return;
          }
          setSaving(true);
          setError("");
          setMessage("");
          try {
            const response = await fetch("/api/settings/calendar", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                timezone: parsed.data.timezone,
                weekdays: parsed.data.days,
                workStart: parsed.data.start,
                workEnd: parsed.data.end,
                holidays: parsed.data.holidays,
                exceptions: parsed.data.exceptions,
              }),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok)
              throw new Error(
                body?.error ?? "Não foi possível salvar o calendário.",
              );
            const saved = PersistedCalendarSchema.safeParse(body);
            if (!saved.success)
              throw new Error(
                "O servidor não confirmou os horários salvos. Atualize a página para conferir.",
              );
            await mutate(saved.data, { revalidate: false });
            setMessage(
              "Calendário salvo. Os prazos da fila foram atualizados.",
            );
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Não foi possível salvar o calendário.",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="settings-time-fields">
          <label>
            Início do expediente
            <input
              required
              type="time"
              value={draft.start}
              onChange={(e) => setDraft({ ...draft, start: e.target.value })}
            />
          </label>
          <label>
            Fim do expediente
            <input
              required
              type="time"
              value={draft.end}
              onChange={(e) => setDraft({ ...draft, end: e.target.value })}
            />
          </label>
        </div>
        <fieldset>
          <legend>Dias úteis</legend>
          <div className="settings-weekdays">
            {[
              "Domingo",
              "Segunda",
              "Terça",
              "Quarta",
              "Quinta",
              "Sexta",
              "Sábado",
            ].map((label, i) => (
              <label key={i}>
                <input
                  type="checkbox"
                  checked={draft.days.includes(i)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      days: e.target.checked
                        ? [...draft.days, i]
                        : draft.days.filter((d) => d !== i),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Feriados e exceções
          <textarea
            rows={5}
            placeholder="2026-12-25"
            value={holidays}
            onChange={(e) => setHolidays(e.target.value)}
            aria-describedby="holiday-help"
          />
        </label>
        <small id="holiday-help">
          Uma data por linha, no formato AAAA-MM-DD. Nesses dias, o relógio da
          fila fica pausado.
        </small>
        <div className="settings-calendar-note">
          <strong>
            Prazo para assumir: {CLAIM_TARGET_MINUTES} minutos úteis
          </strong>
          <p>
            A contagem pausa fora do expediente, nos dias não selecionados e nos
            feriados cadastrados. Atendimentos já assumidos preservam o
            calendário registrado no momento da atribuição.
          </p>
        </div>
        {error && <p role="alert">{error}</p>}
        <p role="status">{message}</p>
        <div className="actions">
          <Button
            type="submit"
            disabled={saving || isLoading || Boolean(calendarError)}
          >
            {saving ? "Salvando…" : "Salvar calendário"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setDraft(calendar);
              setHolidays(calendar.holidays.join("\n"));
              setError("");
              setMessage("Alterações descartadas.");
            }}
          >
            Descartar alterações
          </Button>
        </div>
      </form>
    </>
  );
}
