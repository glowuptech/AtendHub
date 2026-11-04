"use client";
import { useId, useState } from "react";
import { Search } from "lucide-react";
import type { Lead, AppointmentMirror } from "@/domain/schemas";
import { Button } from "@/components/ui/button";
import { localDay } from "@/features/clients/services/overview";
import { searchBookingLeads, type LeadFilter } from "../services/lead-search";
export function LeadPicker({
  leads,
  appointments,
  clientId,
  value,
  onChange,
}: {
  leads: Lead[];
  appointments: AppointmentMirror[];
  clientId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState<LeadFilter>("all"),
    [limit, setLimit] = useState(25);
  const filtered = searchBookingLeads(leads, appointments, {
    clientId,
    query,
    filter,
    today: localDay(new Date().toISOString()),
  });
  const selected = leads.find(
    (lead) => lead.clientId === clientId && lead.id === value,
  );
  const booked = new Set(
    appointments.filter((a) => a.clientId === clientId).map((a) => a.leadId),
  );
  function clear() {
    setQuery("");
    setFilter("all");
    setLimit(25);
  }
  return (
    <fieldset className="booking-lead-picker">
      <legend>Selecionar lead</legend>
      <div className="form-columns">
        <label className="booking-lead-search">
          Buscar lead
          <span>
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              placeholder="Nome, telefone ou e-mail"
              autoComplete="off"
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(25);
              }}
            />
          </span>
        </label>
        <label>
          Filtrar leads
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as LeadFilter);
              setLimit(25);
            }}
          >
            <option value="all">Todos · mais recentes primeiro</option>
            <option value="unbooked">Sem agendamento registrado</option>
            <option value="recent7">Cadastrados nos últimos 7 dias</option>
            <option value="recent30">Cadastrados nos últimos 30 dias</option>
          </select>
        </label>
      </div>
      {selected && (
        <div className="booking-lead-selected">
          <span>
            <strong>Selecionado: {selected.name}</strong>
            <small>
              {selected.contact?.phone ||
                selected.contact?.email ||
                "Contato não informado"}
            </small>
            {!filtered.some((lead) => lead.id === value) && (
              <small>A seleção foi mantida, mesmo fora do filtro atual.</small>
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
          >
            Limpar seleção
          </Button>
        </div>
      )}
      <small role="status" aria-live="polite">
        {filtered.length} lead{filtered.length === 1 ? "" : "s"} encontrado
        {filtered.length === 1 ? "" : "s"}
        {filtered.length > limit ? ` · exibindo ${limit}` : ""}
      </small>
      <div
        className="booking-lead-results"
        role="radiogroup"
        aria-label="Resultados da busca de leads"
      >
        {filtered.slice(0, limit).map((lead) => (
          <label key={lead.id} className="booking-lead-option">
            <input
              type="radio"
              name={`lead-${id}`}
              value={lead.id}
              checked={value === lead.id}
              aria-label={lead.name || lead.contact?.phone || "Lead sem nome"}
              onChange={() => onChange(lead.id)}
            />
            <span>
              <strong>
                {lead.name || lead.contact?.phone || "Lead sem nome"}
              </strong>
              <small>
                {lead.contact?.phone || "Telefone não informado"}
                {lead.contact?.email ? ` · ${lead.contact.email}` : ""}
              </small>
              <small>
                {booked.has(lead.id)
                  ? "Com agendamento registrado"
                  : "Sem agendamento registrado"}{" "}
                · Cadastro:{" "}
                {localDay(lead.createdAt).split("-").reverse().join("/")}
              </small>
            </span>
          </label>
        ))}
      </div>
      {!filtered.length && (
        <div className="booking-lead-empty">
          <p>Nenhum lead encontrado neste filtro.</p>
          <Button type="button" variant="outline" size="sm" onClick={clear}>
            Limpar busca e filtros
          </Button>
        </div>
      )}
      {filtered.length > limit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLimit((previous) => previous + 25)}
        >
          Mostrar mais leads
        </Button>
      )}
      <small>
        “Sem agendamento registrado” considera todo o histórico deste cliente,
        inclusive consultas passadas. “Recentes” considera a data de cadastro.
      </small>
    </fieldset>
  );
}
