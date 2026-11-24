"use client";
import { RegistrationFields } from "@/features/leads/registration/fields";
import { useRegistration } from "@/features/leads/registration/hooks";
import {
  emptyRegistration,
  type BookingDetailsDraft,
} from "@/features/leads/registration/model";
export function BookingDetailsFields({
  leadId,
  enabled,
  value,
  onChange,
}: {
  leadId: string;
  enabled: boolean;
  value: BookingDetailsDraft;
  onChange: (v: BookingDetailsDraft) => void;
}) {
  const registration = useRegistration(leadId || null);
  return (
    <details className="booking-extra-fields">
      <summary>Dados pessoais e valor do serviço</summary>
      {!enabled && (
        <p role="status">
          A ativação destes campos no banco está pendente. O agendamento comum
          continua disponível.
        </p>
      )}
      {registration.error && (
        <p role="alert">Não foi possível carregar os dados pessoais.</p>
      )}
      <RegistrationFields
        value={
          value.personalData ?? registration.data?.data ?? emptyRegistration()
        }
        onChange={(personalData) => onChange({ ...value, personalData })}
        disabled={
          !enabled ||
          !registration.data?.supported ||
          !registration.data.canEdit
        }
      />
      {registration.data?.supported && !registration.data.canEdit && (
        <p role="status">
          Sua conta pode consultar, mas não editar os dados pessoais ou o valor
          do serviço.
        </p>
      )}
      <fieldset
        disabled={
          !enabled ||
          !registration.data?.supported ||
          !registration.data.canEdit
        }
      >
        <legend>Serviço agendado</legend>
        <label>
          Serviço ou consulta
          <input
            maxLength={160}
            value={value.serviceName ?? ""}
            onChange={(e) =>
              onChange({ ...value, serviceName: e.target.value })
            }
          />
        </label>
        <label>
          Valor previsto (R$)
          <input
            inputMode="decimal"
            value={value.amountInput ?? ""}
            placeholder="0,00"
            onChange={(e) =>
              onChange({ ...value, amountInput: e.target.value })
            }
          />
        </label>
        <small>
          Valor do serviço; não representa pagamento recebido nem comissão.
        </small>
      </fieldset>
    </details>
  );
}
