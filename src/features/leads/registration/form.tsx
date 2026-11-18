"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RegistrationFields } from "./fields";
import {
  useRegistration,
  featureRequest,
  readRegistrationResponse,
  type RegistrationResponse,
} from "./hooks";
import {
  registrationSchema,
  validationMessage,
  type Registration,
} from "./model";
export function RegistrationForm({
  leadId,
  name,
  onSaved,
}: {
  leadId: string;
  name: string;
  onSaved?: () => void;
}) {
  const { data, error, isLoading, mutate } = useRegistration(leadId);
  const [edited, setEdited] = useState<Registration | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  if (isLoading) return <p role="status">Carregando dados pessoais…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return null;
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!data.supported || !data.canEdit) return;
        const parsed = registrationSchema.safeParse(edited ?? data.data);
        if (!parsed.success) {
          setNotice(parsed.error.issues[0].message);
          return;
        }
        setBusy(true);
        try {
          const result = await featureRequest<RegistrationResponse>(
            `/api/leads/${leadId}/registration`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(parsed.data),
            },
          );
          if (!result.supported)
            throw new Error("O servidor não confirmou a gravação dos dados.");
          const confirmed = readRegistrationResponse(result);
          await mutate(confirmed, { revalidate: false });
          setEdited(null);
          setNotice("Dados pessoais salvos.");
          onSaved?.();
        } catch (cause) {
          setNotice(validationMessage(cause, "Não foi possível salvar."));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Contato: <strong>{name}</strong>. O nome completo pode ser diferente do
        nome usado no lead.
      </p>
      {!data.supported && (
        <p role="status">
          O cadastro destes campos está preparado e aguarda ativação da
          persistência no servidor.
        </p>
      )}
      {data.supported && !data.canEdit && (
        <p role="status">
          Sua conta pode consultar, mas não editar estes dados.
        </p>
      )}
      <RegistrationFields
        value={edited ?? data.data}
        onChange={setEdited}
        disabled={busy || !data.supported || !data.canEdit}
      />
      {notice && <p role="status">{notice}</p>}
      <Button disabled={busy || !data.supported || !data.canEdit} type="submit">
        {busy ? "Salvando…" : "Salvar dados pessoais"}
      </Button>
    </form>
  );
}
