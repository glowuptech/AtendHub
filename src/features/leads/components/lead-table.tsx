"use client";
import Link from "next/link";
import type { Lead } from "@/domain/schemas";
import type { PersistedLead } from "@/features/leads/hooks";
import { Badge, Empty, stageLabels } from "@/components/layout/shared";
type TableLead = PersistedLead | Lead;
export function LeadTable({ leads }: { leads: TableLead[] }) {
  if (!leads.length) return <Empty />;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Lead / origem</th>
            <th>Estágio</th>
            <th>Responsável</th>
            <th>Sem contato</th>
            <th>Próxima ação</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const captureStatus = "capture_status" in l ? l.capture_status : l.captureStatus;
            const owner = "owner_id" in l ? l.owner_id : l.owner;
            const minutes = "created_at" in l ? 0 : l.minutesSinceContact;
            const nextAction = "next_action" in l ? l.next_action : l.nextAction;
            return (
            <tr key={l.id}>
              <td>
                <Link className="person-link" href={`/app/leads/${l.id}`}>
                  <span className="avatar soft">
                    {l.name.split(" ").at(-1)?.slice(0, 2)}
                  </span>
                  <span>
                    {l.name}
                    <small>{l.source}</small>
                    {captureStatus !== "completed" && (
                      <small>
                        {captureStatus === "incomplete"
                          ? "Cadastro incompleto"
                          : "Cadastro em andamento"}
                      </small>
                    )}
                  </span>
                </Link>
              </td>
              <td>
                <Badge
                  tone={
                    l.stage === "scheduled"
                      ? "success"
                      : l.stage === "new"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {stageLabels[l.stage]}
                </Badge>
              </td>
              <td>{owner ? "Responsável atribuído" : "Não atribuído"}</td>
              <td>
                {minutes ? `${minutes} min` : "—"} <small>tempo </small>
              </td>
              <td>{nextAction}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
