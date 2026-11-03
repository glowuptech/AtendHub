"use client";
import Link from "next/link";
import type { Lead } from "@/domain/schemas";
import { Badge, Empty, stageLabels } from "@/components/layout/shared";
export function LeadTable({ leads }: { leads: Lead[] }) {
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
          {leads.map((l) => (
            <tr key={l.id}>
              <td>
                <Link className="person-link" href={`/app/leads/${l.id}`}>
                  <span className="avatar soft">
                    {l.name.split(" ").at(-1)?.slice(0, 2)}
                  </span>
                  <span>
                    {l.name}
                    <small>{l.source}</small>
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
              <td>{l.owner ?? "Não atribuído"}</td>
              <td>
                {l.minutesSinceContact} min <small>tempo </small>
              </td>
              <td>{l.nextAction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
