"use client";
import { useState } from "react";
import Link from "next/link";
import { FileText, Plus, Copy, Archive } from "lucide-react";
import { useDemo } from "@/components/layout/demo-context";
import {
  Heading,
  Card,
  Badge,
  NavButton,
  Denied,
  Empty,
} from "@/components/layout/shared";
import { Button } from "@/components/ui/button";
export function FormsList({ id }: { id: string }) {
  const { repositories, clientId, refresh } = useDemo();
  const [status, setStatus] = useState("all"),
    [notice, setNotice] = useState("");
  if (id !== clientId) return <Denied />;
  const forms = repositories.forms
    .list(id)
    .filter((f) => status === "all" || f.status === status);
  const base = `/app/clientes/${id}/formularios`;
  return (
    <>
      <Heading
        eyebrow={repositories.clients.get(id).name}
        title="Formulários"
        description="Formulários nativos com a identidade da clínica e campos conectados ao CRM."
        action={
          <NavButton href={`${base}/novo`}>
            <Plus size={16} />
            Novo formulário
          </NavButton>
        }
      />
      <div className="toolbar">
        <label className="push-right">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos</option>
            <option value="demo">Ativo</option>
            <option value="draft">Rascunho</option>
            <option value="archived">Arquivado</option>
          </select>
        </label>
      </div>
      <div className="cards-grid">
        {forms.map((f) => {
          const v = f.versions.find((v) => v.id === f.activeVersionId)!;
          const live = repositories.capture.stats(id, f.id);
          return (
            <Card key={f.id}>
              <div className="section-caption">
                <span className="large-icon">
                  <FileText />
                </span>
                <Badge>
                  {f.status === "archived"
                    ? "Arquivado"
                    : f.status === "draft"
                      ? "Rascunho"
                      : "Ativo"}
                </Badge>
              </div>
              <h2>{f.name}</h2>
              <p>
                {v.steps.length} etapas · versão {v.number} ·{" "}
                {f.versions.length} versão(ões) preservada(s)
              </p>
              <div className="mini-stats">
                <span>
                  <strong>{live.views}</strong> visualizações válidas
                </span>
                <span>
                  <strong>
                    {live.views
                      ? `${Math.round((live.qualifiedCompleted / live.views) * 100)}%`
                      : "N/D"}
                  </strong>{" "}
                  {live.completed} concluídos · {live.incomplete} incompletos
                </span>
              </div>
              <div className="actions">
                <NavButton href={`${base}/${f.id}/editar`}>Editar</NavButton>
                <NavButton href={`${base}/${f.id}/preview`}>Prévia</NavButton>
                {f.status !== "draft" && f.status !== "archived" && (
                  <NavButton href={`/f/${f.slug}`}>Abrir formulário</NavButton>
                )}
                <NavButton href="/app/leads">Respostas no CRM</NavButton>
                <Link href={`${base}/${f.id}/analytics`}>Analytics</Link>
                <Link href={`${base}/${f.id}/tracking`}>Mensuração</Link>
              </div>
              <div className="actions separated">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    repositories.forms.duplicate(id, f.id);
                    refresh();
                    setNotice(
                      "Cópia criada em memória, com IDs próprios e campos explicitamente preservados.",
                    );
                  }}
                >
                  <Copy size={14} />
                  Duplicar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={f.status === "archived"}
                  onClick={() => {
                    repositories.forms.archive(id, f.id);
                    refresh();
                    setNotice("Formulário arquivado apenas nesta sessão.");
                  }}
                >
                  <Archive size={14} />
                  Arquivar
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      {!forms.length && <Empty />}
      <p role="status">{notice}</p>
    </>
  );
}
