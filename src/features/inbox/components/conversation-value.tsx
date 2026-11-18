"use client";
import { useState } from "react";
import useSWR from "swr";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  parseAmount,
  serviceValueSchema,
  validationMessage,
} from "@/features/leads/registration/model";
import { featureRequest } from "@/features/leads/registration/hooks";
const responseSchema = z.object({
  supported: z.boolean(),
  canEdit: z.boolean(),
  value: serviceValueSchema.nullable(),
  appointments: z.array(z.object({ id: z.string().uuid(), label: z.string() })),
});
type Response = z.infer<typeof responseSchema>;
function readResponse(body: unknown): Response {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success)
    throw new Error(
      "O servidor não confirmou o valor do serviço. Tente novamente.",
    );
  return parsed.data;
}
export function ConversationValue({
  conversationId,
}: {
  conversationId: string;
}) {
  const endpoint = `/api/inbox/conversations/${conversationId}/value`;
  const { data, error, isLoading, mutate } = useSWR<Response>(
    endpoint,
    async (url) => {
      const r = await fetch(url, { cache: "no-store" });
      if ([404, 501].includes(r.status))
        return {
          supported: false,
          canEdit: false,
          value: null,
          appointments: [],
        };
      const body = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(body.error ?? "Não foi possível carregar o valor.");
      return readResponse(body);
    },
    { revalidateOnFocus: false },
  );
  const [edited, setEdited] = useState<{
      description: string;
      amount: string;
      appointmentId: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  if (isLoading) return <p role="status">Carregando valor…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return null;
  const draft = edited ?? {
    description: data.value?.description ?? "",
    amount:
      data.value?.amountCents == null
        ? ""
        : (data.value.amountCents / 100).toFixed(2).replace(".", ","),
    appointmentId: data.value?.appointmentId ?? "",
  };
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!data.supported || !data.canEdit) return;
        try {
          const cents = parseAmount(draft.amount);
          if (!draft.description.trim())
            throw new Error("Informe o serviço ou consulta.");
          setBusy(true);
          const result = await featureRequest<Response>(endpoint, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              serviceValueSchema.parse({
                description: draft.description.trim(),
                amountCents: cents,
                currency: "BRL",
                appointmentId: draft.appointmentId || null,
              }),
            ),
          });
          if (!result.supported || !result.value)
            throw new Error("O servidor não confirmou o valor.");
          const confirmed = readResponse(result);
          await mutate(confirmed, { revalidate: false });
          setEdited(null);
          setNotice("Valor previsto salvo.");
        } catch (cause) {
          setNotice(validationMessage(cause, "Não foi possível salvar."));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Associe um valor previsto ao serviço desta conversa. Isso não registra
        pagamento, faturamento ou comissão.
      </p>
      {!data.supported && (
        <p role="status">
          O vínculo de valores está preparado e aguarda ativação da persistência
          no servidor.
        </p>
      )}
      <fieldset disabled={busy || !data.supported || !data.canEdit}>
        <label>
          Serviço ou consulta
          <input
            maxLength={160}
            value={draft.description}
            onChange={(e) =>
              setEdited({ ...draft, description: e.target.value })
            }
          />
        </label>
        <label>
          Valor previsto (R$)
          <input
            inputMode="decimal"
            value={draft.amount}
            onChange={(e) => setEdited({ ...draft, amount: e.target.value })}
            placeholder="0,00"
          />
        </label>
        <label>
          Vincular ao agendamento
          <select
            value={draft.appointmentId}
            onChange={(e) =>
              setEdited({ ...draft, appointmentId: e.target.value })
            }
          >
            <option value="">Ainda sem agendamento</option>
            {data.appointments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      {notice && <p role="status">{notice}</p>}
      <Button disabled={busy || !data.supported || !data.canEdit} type="submit">
        {busy ? "Salvando…" : "Salvar valor previsto"}
      </Button>
    </form>
  );
}
