"use client";
import { useState } from "react";
import useSWR from "swr";

export function FormCapiEditor({
  formId,
  pixel,
}: {
  formId: string;
  pixel: string;
}) {
  const url = formId ? `/api/forms/${formId}/capi` : null;
  const { data, error, mutate } = useSWR(url, async (key: string) => {
    const response = await fetch(key);
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
    return result as { pixel?: string; testCode?: string };
  });
  const [token, setToken] = useState("");
  const [code, setCode] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(remove: boolean) {
    if (!url) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: remove ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: remove
          ? undefined
          : JSON.stringify({
              pixel,
              token,
              testCode: code ?? data?.testCode ?? "",
            }),
      });
      if (!response.ok) throw Error((await response.json()).error);
      setToken("");
      setCode(undefined);
      await mutate();
      setMessage(remove ? "Token removido." : "Configuração salva.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={busy || !data}>
      <legend>API de Conversões da Meta</legend>
      {!formId ? (
        <p>Salve o formulário para cadastrar o token.</p>
      ) : error ? (
        <p>{error.message}</p>
      ) : (
        <>
          {data?.pixel && <p>Token cadastrado para o Pixel {data.pixel}.</p>}
          <label>
            Token da API de Conversões
            <input
              type="password"
              autoComplete="new-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <label>
            Código de evento de teste (opcional)
            <input
              value={code ?? data?.testCode ?? ""}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={
              !/^\d{5,30}$/.test(pixel) ||
              (!token.trim() && data?.pixel !== pixel)
            }
            onClick={() => save(false)}
          >
            Salvar configuração da API
          </button>
          {data?.pixel && (
            <button type="button" onClick={() => save(true)}>
              Remover token
            </button>
          )}
          <p role="status">{message}</p>
        </>
      )}
    </fieldset>
  );
}
