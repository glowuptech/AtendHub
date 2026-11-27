"use client";

import { useState } from "react";

const chunk = 6 * 1024 * 1024;

async function upload(file: File, path: string, signature: string, progress: (n: number) => void) {
  const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL + "/storage/v1/upload/resumable";
  const headers = { "Tus-Resumable": "1.0.0", "x-signature": signature };
  const metadata = Object.entries({ bucketName: "production-files", objectName: path, contentType: file.type || "application/octet-stream" })
    .map(([key, value]) => key + " " + btoa(value)).join(",");
  const created = await fetch(endpoint, { method: "POST", headers: {
    ...headers, "Upload-Length": String(file.size), "Upload-Metadata": metadata,
  } });
  const location = created.headers.get("Location");
  if (!created.ok || !location) throw new Error("O armazenamento recusou o envio. Confira o limite por arquivo do projeto.");
  const url = new URL(location, endpoint);
  let offset = 0;
  let failures = 0;
  while (offset < file.size) {
    const end = Math.min(offset + chunk, file.size);
    const result = await fetch(url, { method: "PATCH", headers: {
      ...headers, "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream",
    }, body: file.slice(offset, end) }).catch(() => null);
    if (result?.ok) {
      offset = end;
      failures = 0;
    } else {
      if (++failures > 3) throw new Error("Envio interrompido. Selecione o arquivo para tentar novamente.");
      await new Promise(resolve => setTimeout(resolve, failures * 1000));
      const head = await fetch(url, { method: "HEAD", headers }).catch(() => null);
      const value = head?.headers.get("Upload-Offset");
      if (head?.ok && value && /^\d+$/.test(value)) offset = Number(value);
    }
    progress(Math.floor(100 * offset / file.size));
  }
}

export function ProductionFiles({ task, client, edit }: { task: string; client: string; edit: boolean }) {
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [percent, setPercent] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const endpoint = "/api/production?clientId=" + client + "&files=" + task;
  async function request(body?: object) {
    const response = await fetch(endpoint, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Falha ao acessar os arquivos.");
    return data;
  }
  const report = (e: unknown) => setError(e instanceof Error ? e.message : "Falha ao acessar os arquivos.");
  async function refresh() {
    setNames((await request()).names);
    setLoaded(true);
  }
  return <details onToggle={e => { if (e.currentTarget.open) void refresh().catch(report); }}>
    <summary>Arquivos da demanda</summary>
    {loaded && !names.length && <p>Nenhum arquivo enviado.</p>}
    {names.map(name => <button key={name} type="button" onClick={async () => {
      const tab = window.open("about:blank", "_blank");
      if (!tab) return setError("Permita abrir o arquivo em outra aba.");
      tab.opener = null;
      try { tab.location.href = (await request({ action: "read", name })).url; }
      catch (e) { tab.close(); report(e); }
    }}>{name.slice(51)}</button>)}
    {edit && <label>Enviar arte ou vídeo
      <input type="file" accept=".png,.jpg,.jpeg,.webp,.mp4,.mov,.webm" disabled={percent !== null} onChange={async e => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setError(""); setPercent(0);
        try {
          const { path, signature } = await request({ action: "upload", name: file.name });
          await upload(file, path, signature, setPercent);
          await refresh();
        } catch (err) { report(err); }
        finally { setPercent(null); }
      }} />
    </label>}
    {percent !== null && <p role="status">Enviando · {percent}%</p>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
