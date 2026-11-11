"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PathDiagnostics({ report }: { report: unknown }) {
  const [copyStatus, setCopyStatus] = useState("");
  const serialized = JSON.stringify(report, null, 2);

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(serialized);
      setCopyStatus("Diagnóstico copiado.");
    } catch {
      setCopyStatus(
        "Não foi possível copiar. Selecione e copie o conteúdo abaixo.",
      );
    }
  }

  return (
    <details className="path-diagnostics" data-testid="path-diagnostics">
      <summary>Diagnóstico dos caminhos</summary>
      <div className="path-diagnostics-content">
        <p className="muted">
          Contém somente IDs de versão, etapas, perguntas, campos, opções e
          caminhos. Não inclui respostas preenchidas nem dados de contato.
        </p>
        <Button type="button" variant="outline" onClick={copyReport}>
          Copiar diagnóstico
        </Button>
        <span role="status" aria-live="polite">
          {copyStatus}
        </span>
        <pre aria-label="Dados do diagnóstico">{serialized}</pre>
      </div>
    </details>
  );
}
