"use client";
import { maskCpf, type Registration } from "./model";
export function RegistrationFields({
  value,
  onChange,
  disabled = false,
}: {
  value: Registration;
  onChange: (v: Registration) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Dados pessoais do contato</legend>
      <div className="form-columns">
        <label>
          Nome completo
          <input
            maxLength={160}
            autoComplete="off"
            value={value.fullName}
            onChange={(e) => onChange({ ...value, fullName: e.target.value })}
          />
        </label>
        <label>
          CPF
          <input
            maxLength={14}
            inputMode="numeric"
            autoComplete="off"
            value={maskCpf(value.cpf)}
            onChange={(e) => onChange({ ...value, cpf: e.target.value })}
          />
        </label>
        <label>
          RG
          <input
            maxLength={30}
            autoComplete="off"
            value={value.rg}
            onChange={(e) => onChange({ ...value, rg: e.target.value })}
          />
        </label>
        <label>
          Data de nascimento
          <input
            type="date"
            autoComplete="off"
            value={value.birthDate}
            onChange={(e) => onChange({ ...value, birthDate: e.target.value })}
          />
        </label>
      </div>
    </fieldset>
  );
}
