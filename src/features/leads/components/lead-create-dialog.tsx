"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Client } from "@/domain/schemas";

type Props = { client: Client; onClose: () => void; onCreated: () => void };
type FormState = { name: string; phone: string; email: string; professionalId: string; notes: string };

export function LeadCreateDialog({ client, onClose, onCreated }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<FormState>({ name: "", phone: "", email: "", professionalId: "", notes: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.phone.trim() && !form.email.trim()) return setError("Informe telefone ou e-mail.");
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ clientId: client.id, name: form.name, phone: form.phone, email: form.email, professionalId: form.professionalId || null, notes: form.notes }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(`${body.error ?? "Não foi possível cadastrar o lead."}${body.supportId ? ` Código: ${body.supportId}` : ""}`);
      onCreated();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar o lead.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog ref={ref} className="schedule-dialog" aria-label="Novo lead" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="section-caption">
        <div><p className="eyebrow">CADASTRO MANUAL</p><h2>Novo lead</h2></div>
        <Button size="icon" variant="ghost" aria-label="Fechar janela" onClick={onClose}><X size={18} /></Button>
      </div>
      <form onSubmit={submit} className="form-stack">
        <div className="notice"><strong>Cliente</strong><br />{client.name}</div>
        <label>Nome *<input required minLength={2} maxLength={160} value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
        <div className="form-grid-2">
          <label>Telefone/WhatsApp<input inputMode="tel" maxLength={40} value={form.phone} onChange={(e) => update("phone", e.target.value)} /></label>
          <label>E-mail<input type="email" maxLength={160} value={form.email} onChange={(e) => update("email", e.target.value)} /></label>
        </div>
        <p className="muted">Informe pelo menos um contato válido.</p>
        <label>Profissional (opcional)<select value={form.professionalId} onChange={(e) => update("professionalId", e.target.value)}><option value="">Sem profissional</option>{client.doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label>
        <label>Observações (opcional)<textarea maxLength={2000} rows={4} value={form.notes} onChange={(e) => update("notes", e.target.value)} /></label>
        {error && <p role="alert" className="error-text">{error}</p>}
        <div className="dialog-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Cadastrar lead"}</Button></div>
      </form>
    </dialog>
  );
}
