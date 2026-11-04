"use client";
import { BillingSchema, paymentLabels, type Billing } from "@/domain/billing";
import { Card } from "@/components/layout/shared";
export function BillingFields({
  value,
  editing,
  onChange,
}: {
  value?: Billing;
  editing: boolean;
  onChange: (v: Billing) => void;
}) {
  const billing = value ?? BillingSchema.parse({});
  return (
    <Card title="Mensalidade e pagamento">
      {editing ? (
        <>
          <label>
            Mensalidade de referência (R$)
            <input
              name="monthlyFee"
              inputMode="decimal"
              defaultValue={
                billing.monthlyFeeCents === null
                  ? ""
                  : (billing.monthlyFeeCents / 100).toFixed(2)
              }
              placeholder="Ex.: 1500,00"
            />
          </label>
          <label>
            Forma de pagamento
            <select
              value={billing.paymentMethod ?? ""}
              onChange={(e) => {
                const method = (e.target.value ||
                  null) as Billing["paymentMethod"];
                onChange({
                  ...billing,
                  paymentMethod: method,
                  installments:
                    method === "credit_card"
                      ? (billing.installments ?? 1)
                      : null,
                });
              }}
            >
              <option value="">Não definida</option>
              {Object.entries(paymentLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {billing.paymentMethod === "credit_card" && (
            <label>
              Parcelamento no cartão
              <select
                value={billing.installments ?? 1}
                onChange={(e) =>
                  onChange({ ...billing, installments: Number(e.target.value) })
                }
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}x
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      ) : (
        <>
          <div className="profile-info-field">
            <small>Mensalidade de referência</small>
            <strong>
              {billing.monthlyFeeCents === null
                ? "Não informada"
                : (billing.monthlyFeeCents / 100).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: billing.currency,
                  })}
            </strong>
          </div>
          <div className="profile-info-field">
            <small>Forma de pagamento</small>
            <strong>
              {billing.paymentMethod
                ? paymentLabels[billing.paymentMethod]
                : "Não definida"}
              {billing.paymentMethod === "credit_card"
                ? ` · ${billing.installments}x`
                : ""}
            </strong>
          </div>
        </>
      )}
      <small>
        Condições comerciais para a futura cobrança. O total do contrato,
        descontos e período coberto serão definidos antes da emissão; não são
        calculados a partir do número de parcelas.
      </small>
    </Card>
  );
}
