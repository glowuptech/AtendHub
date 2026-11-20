"use client";
import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/layout/shared";
import { rootDomain, reserved, slugPattern } from "./model";

type DomainInfo = {
  canEdit: boolean;
  domain: { slug: string; active: boolean } | null;
  origin: string | null;
  dnsTarget: string | null;
  dnsSource: "hosting" | "panel" | null;
};
const fetchDomain = async (
  url: string,
  init?: RequestInit,
): Promise<DomainInfo> => {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body)
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Não foi possível carregar o domínio.",
    );
  return body;
};
export function useClientOrigin(clientId: string) {
  return useSWR(`/api/clients/${clientId}/domain`, fetchDomain, {
    shouldRetryOnError: false,
  }).data?.origin;
}
export function ClientDomainSettings({ clientId }: { clientId: string }) {
  const url = `/api/clients/${clientId}/domain`;
  const { data, error, mutate } = useSWR(url, fetchDomain, {
    shouldRetryOnError: false,
  });
  const [draft, setDraft] = useState<string>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const slug = (draft ?? data?.domain?.slug ?? "").trim().toLowerCase();
  const host = `${slug}.${rootDomain}`;
  const saved = slug === data?.domain?.slug;
  async function save(active: boolean) {
    setBusy(true);
    setNotice("");
    try {
      if (active) {
        const response = await fetch(`https://${host}/api/domain-check`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok || (await response.json()).host !== host)
          throw new Error(
            "O endereço ainda não aponta para o Atend&Hub com HTTPS.",
          );
      }
      const result = await fetchDomain(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, active }),
      });
      await mutate(result, false);
      setDraft(undefined);
      setNotice(active ? "Domínio ativo." : "Configuração salva.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(label + " copiado.");
    } catch {
      setNotice("Selecione o valor e copie manualmente.");
    }
  }
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p role="status">Carregando domínio…</p>;
  const valid = slugPattern.test(slug) && !reserved.includes(slug);
  return (
    <Card>
      <h2>Domínio público</h2>
      <label>
        Subdomínio{" "}
        <input
          value={draft ?? data.domain?.slug ?? ""}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="dra-ana-luiza"
          disabled={!data.canEdit || busy}
        />
      </label>
      <p>{valid ? `https://${host}` : rootDomain}</p>
      {saved && (
        <p>
          {data.domain?.active
            ? "Ativo"
            : "Aguardando configuração de DNS e HTTPS"}
        </p>
      )}
      {valid && (
        <>
          <h3>Registro para o provedor de DNS</h3>
          <dl>
            <dt>Tipo</dt>
            <dd>CNAME</dd>
            <dt>Nome na zona {rootDomain}</dt>
            <dd>
              <code>{slug}</code>{" "}
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(slug, "Nome")}
              >
                Copiar nome
              </Button>
            </dd>
            <dt>Destino</dt>
            <dd>
              {data.dnsTarget ? (
                <>
                  <code>{data.dnsTarget}</code>{" "}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copy(data.dnsTarget!, "Destino")}
                  >
                    Copiar destino
                  </Button>
                </>
              ) : (
                "O destino não está disponível. Configure ATENDHUB_DNS_TARGET com o CNAME indicado pela hospedagem."
              )}
            </dd>
          </dl>
          {data.dnsSource === "panel" && (
            <p>
              Destino consultado no DNS do painel. Se a hospedagem indicar um
              valor específico para este subdomínio, use o valor indicado por
              ela.
            </p>
          )}
        </>
      )}
      <p>
        Se o DNS e o certificado coringa de {rootDomain} já estiverem
        configurados, você pode verificar o endereço salvo diretamente.
      </p>
      {data.canEdit && (
        <div className="actions">
          {!saved && (
            <Button disabled={!valid || busy} onClick={() => save(false)}>
              Salvar subdomínio
            </Button>
          )}
          {saved && !data.domain?.active && (
            <Button disabled={busy} onClick={() => save(true)}>
              Verificar HTTPS e ativar
            </Button>
          )}
          {saved && data.domain?.active && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => save(false)}
            >
              Desativar
            </Button>
          )}
        </div>
      )}
      {saved && data.origin && (
        <p>
          <a href={data.origin + "/portal"}>Abrir portal do cliente</a>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </Card>
  );
}
