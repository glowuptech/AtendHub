"use client";
/* eslint-disable @next/next/no-img-element */
import type { CustomFieldDefinition, FieldValue } from "@/domain/schemas";
export function FieldInput({
  field,
  value,
  onChange,
  id = field.id,
  errorId,
  choiceCards = false,
}: {
  field: CustomFieldDefinition;
  value: FieldValue | undefined;
  onChange: (v: FieldValue) => void;
  id?: string;
  errorId?: string;
  choiceCards?: boolean;
}) {
  const common = {
    id,
    "aria-label": field.label,
    "aria-describedby": errorId,
    "aria-invalid": !!errorId,
  };
  if (field.type === "consent")
    return (
      <label className="check-option">
        <input
          {...common}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    );
  if (field.type === "boolean")
    return (
      <select
        {...common}
        value={value === true ? "yes" : value === false ? "no" : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : e.target.value === "yes")
        }
      >
        <option value="">Selecione</option>
        <option value="yes">Sim</option>
        <option value="no">Não</option>
      </select>
    );
  if ((field.type === "single_select" || field.type === "image_choice") && choiceCards)
    return (
      <fieldset className={field.type === "image_choice" ? "choice-cards choice-cards-image" : "choice-cards"} aria-label={field.label} aria-describedby={errorId}>
        {field.options.map((o) => (
          <label className={`choice-card ${value === o.id ? "selected" : ""}`} key={o.id}>
            <input type="radio" name={id} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
            {field.type === "image_choice" && o.imageUrl && <img src={o.imageUrl} alt={o.alt || o.label} />}
            <span><strong>{o.label}</strong>{o.description && <small>{o.description}</small>}</span>
            {value === o.id && <span className="choice-card-check" aria-hidden="true">✓</span>}
          </label>
        ))}
      </fieldset>
    );
  if (field.type === "single_select")
    return (
      <select
        {...common}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Selecione uma opção</option>
        {field.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );
  if (field.type === "multi_select")
    return (
      <fieldset aria-describedby={errorId}>
        <legend>{field.label}</legend>
        {field.options.map((o) => (
          <label className="check-option" key={o.id}>
            <input
              type="checkbox"
              checked={Array.isArray(value) && value.includes(o.id)}
              onChange={(e) => {
                const v = Array.isArray(value) ? value : [];
                onChange(
                  e.target.checked ? [...v, o.id] : v.filter((i) => i !== o.id),
                );
              }}
            />
            {o.label}
          </label>
        ))}
      </fieldset>
    );
  if (field.type === "long_text")
    return (
      <textarea
        {...common}
        value={typeof value === "string" ? value : ""}
        maxLength={1000}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  return (
    <input
      {...common}
      type={
        field.type === "phone"
          ? "tel"
          : field.type === "email"
            ? "email"
            : field.type === "date"
              ? "date"
              : "text"
      }
      autoComplete="off"
      placeholder={
        field.type === "phone"
          ? "+5500000000000 ()"
          : field.type === "email"
            ? "exemplo@example.com"
            : "Sua resposta "
      }
      value={typeof value === "string" ? value : ""}
      maxLength={150}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
