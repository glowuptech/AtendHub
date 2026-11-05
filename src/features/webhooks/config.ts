import { z } from "zod";
export const webhookDestinations = [
  {
    id: "forms",
    title: "Notificações de formulários",
    description:
      "Cadastros concluídos e cadastros incompletos após o prazo sem avanço. O evento identifica organização, cliente, formulário e lead.",
    events: ["lead.completed", "lead.incomplete"],
  },
  {
    id: "whatsappConnection",
    title: "Conexão de WhatsApp",
    description:
      "Solicitação de uma nova conexão de WhatsApp. O n8n conduz a conexão com a Evolution, vinculada ao cliente e à instância correspondente.",
    events: ["whatsapp.connection.requested"],
  },
  {
    id: "inboxMessages",
    title: "Envio de mensagens do Inbox",
    description:
      "Solicitação de envio de uma mensagem revisada pelo atendente. O evento identifica cliente, lead, conversa e conexão para o n8n encaminhar ao WhatsApp correto.",
    events: ["inbox.message.send_requested"],
  },
  {
    id: "assistant",
    title: "Assistente IA",
    description:
      "Pergunta interna do atendente com identificação da organização, cliente, operação, profissional, lead e conversa. O n8n consulta a base correspondente e devolve resposta e fontes ao assistente, sem enviar ao WhatsApp.",
    events: ["assistant.question.requested"],
  },
  {
    id: "appointments",
    title: "Agendamentos",
    description:
      "Agendamento manual salvo com sucesso. O evento identifica agendamento, cliente, lead, profissional, operação, data e horário. Um identificador único permitirá evitar notificações duplicadas nas retentativas.",
    events: ["appointment.created"],
  },
  {
    id: "automations",
    title: "Eventos de automação (opcional)",
    description:
      "Auditoria das movimentações automáticas da fila. As regras internas não dependem deste webhook.",
    events: ["automation.stage_changed"],
  },
  {
    id: "followups",
    title: "Disparos de follow-up",
    description:
      "Tarefa elegível para retomar um contato sem resposta. O n8n recebe IDs, canal WhatsApp ou SMS, versão e chave de deduplicação; revalida antes de enviar.",
    events: ["followup.send_requested"],
  },
  {
    id: "reminders",
    title: "Confirmações e lembretes",
    description:
      "Disparo programado antes de um agendamento válido, indicando canal e finalidade. Confirmar ou remarcar invalida tarefas que deixarem de ser elegíveis.",
    events: ["appointment.reminder.send_requested"],
  },
] as const;
export type DestinationId = (typeof webhookDestinations)[number]["id"];
const url = z
  .string()
  .trim()
  .max(2000, "A URL deve ter até 2.000 caracteres.")
  .refine((value) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === "https:" &&
        !!parsed.hostname &&
        !parsed.username &&
        !parsed.password &&
        !parsed.hash
      );
    } catch {
      return false;
    }
  }, "Informe uma URL HTTPS válida, sem usuário, senha ou fragmento.");
export const WebhookConfigSchema = z.object({
  forms: url,
  whatsappConnection: url,
  inboxMessages: url,
  assistant: url,
  appointments: url,
  automations: url.default(""),
  followups: url.default(""),
  reminders: url.default(""),
});
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;
export const emptyWebhookConfig = (): WebhookConfig => ({
  forms: "",
  whatsappConnection: "",
  inboxMessages: "",
  assistant: "",
  appointments: "",
  automations: "",
  followups: "",
  reminders: "",
});
