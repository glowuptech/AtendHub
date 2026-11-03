"use client";
import { useDemo } from "@/components/layout/demo-context";
import {
  Heading,
  Card,
  Badge,
  dateTime,
  Empty,
  NavButton,
} from "@/components/layout/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function Appointments({ portal = false }: { portal?: boolean }) {
  const { repositories, clientId, refresh } = useDemo();
  const [notice, setNotice] = useState("");
  const appointments = repositories.appointments.list(clientId);
  return (
    <>
      <Heading
        title="Agendamentos espelhados"
        description={`${repositories.clients.get(clientId).name} · nenhum horário real ou disponibilidade de agenda.`}
      />
      <Card>
        <p>
          A agenda externa permanece oficial. Alterações abaixo existem somente
          em memória.
        </p>
        {appointments.map((a) => (
          <div className="appointment-row" key={a.id}>
            <div className="date-block">
              <strong>{new Date(a.scheduledAt).getUTCDate()}</strong>
              <span>NOV</span>
            </div>
            <div>
              <h3>{a.name}</h3>
              <p>{dateTime(a.scheduledAt)} · America/Sao_Paulo</p>
              <small>{a.source}</small>
            </div>
            <Badge tone={a.attendance === "present" ? "success" : "neutral"}>
              {a.attendance === "unknown"
                ? "Comparecimento não informado"
                : a.attendance === "present"
                  ? "Compareceu · simulado"
                  : "Não compareceu · simulado"}
            </Badge>
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  repositories.appointments.setAttendance(
                    clientId,
                    a.id,
                    "present",
                  );
                  refresh();
                  setNotice("Presença confirmada apenas na demonstração.");
                }}
              >
                Compareceu
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  repositories.appointments.setAttendance(
                    clientId,
                    a.id,
                    "absent",
                  );
                  refresh();
                  setNotice("Ausência informada apenas na demonstração.");
                }}
              >
                Não compareceu
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  repositories.appointments.setAttendance(
                    clientId,
                    a.id,
                    "unknown",
                  );
                  refresh();
                  setNotice("Permanece não informado.");
                }}
              >
                Confirmar depois
              </Button>
              {!portal && (
                <NavButton href={`/app/leads/${a.leadId}`}>
                  Lead de origem
                </NavButton>
              )}
            </div>
          </div>
        ))}
        {!appointments.length && <Empty />}
        <p role="status">{notice}</p>
      </Card>
    </>
  );
}
export function Portal() {
  const { repositories, clientId } = useDemo();
  const leads = repositories.leads.list(clientId),
    appointments = repositories.appointments.list(clientId),
    known = appointments.filter((a) => a.attendance !== "unknown").length,
    present = appointments.filter((a) => a.attendance === "present").length;
  return (
    <>
      <Heading
        eyebrow="PORTAL DEMONSTRATIVO"
        title={repositories.clients.get(clientId).name}
        description="Aquisição, marcações e comparecimento informado. Sem acesso às conversas internas."
      />
      <div className="metrics">
        <Card title="Leads fictícios">
          <strong className="metric-value">{leads.length}</strong>
          <small>Fonte: fixtures · outubro/novembro de 2026</small>
        </Card>
        <Card title="Espelhos registrados">
          <strong className="metric-value">{appointments.length}</strong>
          <small>Registros fictícios · sem sincronização externa</small>
        </Card>
        <Card title="Comparecimento">
          <strong className="metric-value">
            {known ? `${Math.round((present / known) * 100)}%` : "N/D"}
          </strong>
          <small>
            {present} presentes / {known} presenças ou faltas informadas
          </small>
        </Card>
        <Card title="Cobertura">
          <strong className="metric-value">
            {appointments.length
              ? `${Math.round((known / appointments.length) * 100)}%`
              : "N/D"}
          </strong>
          <small>
            {known} informados / {appointments.length} espelhos DEMO
          </small>
        </Card>
      </div>
      <Card title="Acompanhe os registros de exemplo">
        <p>
          Confirme presença apenas na simulação. Nenhuma atualização é enviada
          ao sistema da clínica.
        </p>
        <NavButton href="/portal/agendamentos">Ver agendamentos</NavButton>
      </Card>
    </>
  );
}
