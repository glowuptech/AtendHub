"use client";
import { useState } from "react";
import {
  type CustomFieldDefinition,
  type FieldType,
  FieldSchema,
} from "@/domain/schemas";
import { Button } from "@/components/ui/button";
export function QuestionOptions({
  field,
  onSave,
}: {
  field: CustomFieldDefinition;
  onSave: (field: CustomFieldDefinition) => void;
}) {
  const [type, setType] = useState<FieldType>(field.type),
    [options, setOptions] = useState(
      field.options.map((o) => [o.label, o.description, o.imageUrl, o.alt].join(" | ")).join("\n"),
    ),
    [error, setError] = useState("");
  return (
    <details>
      <summary>Editar tipo e opções</summary>
      <label>
        Tipo de resposta
        <select
          value={type}
          onChange={(e) => setType(e.target.value as FieldType)}
        >
          <option value="short_text">Texto curto</option>
          <option value="long_text">Texto longo</option>
          <option value="single_select">Seleção única</option>
          <option value="image_choice">Escolha por imagens</option>
          <option value="multi_select">Múltipla seleção</option>
          <option value="phone">Telefone</option>
          <option value="email">E-mail</option>
          <option value="date">Data</option>
          <option value="boolean">Sim / não</option>
          <option value="consent">Aceite</option>
        </select>
      </label>
      {["single_select", "image_choice", "multi_select"].includes(type) && (
        <label>
          {type === "image_choice" ? "Cartões: título | descrição | URL da imagem | texto alternativo (um por linha)" : "Alternativas, uma por linha"}
          <textarea
            value={options}
            onChange={(e) => setOptions(e.target.value)}
          />
        </label>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          try {
            onSave(
              FieldSchema.parse({
                ...field,
                id: crypto.randomUUID(),
                stableKey: `campo_${crypto.randomUUID().replaceAll("-", "")}`,
                type,
                options: ["single_select", "image_choice", "multi_select"].includes(type)
                  ? options.split("\n").map((s) => s.trim()).filter(Boolean).map((line) => {
                      const [label, description = "", imageUrl = "", alt = ""] = line.split("|").map((part) => part.trim());
                      return { id: crypto.randomUUID(), label, description, imageUrl, alt, pathId: null };
                    })
                  : [],
              }),
            );
            setError("");
          } catch {
            setError("Confira as alternativas (de 1 a 20 opções).");
          }
        }}
      >
        Aplicar tipo e opções
      </Button>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
