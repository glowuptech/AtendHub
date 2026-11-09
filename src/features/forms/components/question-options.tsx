"use client";
import { useState } from "react";
import type { CustomFieldDefinition, FieldType, FormVersion } from "@/domain/schemas";
import { Button } from "@/components/ui/button";

type Option = CustomFieldDefinition["options"][number];
const selectable = ["single_select", "image_choice", "multi_select"];

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

export function QuestionOptions({ field, paths = [], onSave }: { field: CustomFieldDefinition; paths?: FormVersion["paths"]; onSave: (field: CustomFieldDefinition) => void }) {
  const [type, setType] = useState<FieldType>(field.type);
  const [options, setOptions] = useState<Option[]>(field.options);
  const [error, setError] = useState("");
  const imageMode = type === "image_choice";

  const updateOption = (id: string, patch: Partial<Option>) => setOptions((current) => current.map((option) => option.id === id ? { ...option, ...patch } : option));
  const addOption = () => setOptions((current) => [...current, { id: crypto.randomUUID(), label: "Nova opção", description: "", imageUrl: "", alt: "", pathId: null }]);

  return (
    <details open={imageMode}>
      <summary>Editar tipo e opções</summary>
      <label>Tipo de resposta<select value={type} onChange={(e) => setType(e.target.value as FieldType)}>
        <option value="short_text">Texto curto</option><option value="long_text">Texto longo</option><option value="single_select">Seleção única</option><option value="image_choice">Escolha por imagens</option><option value="multi_select">Múltipla seleção</option><option value="phone">Telefone</option><option value="email">E-mail</option><option value="date">Data</option><option value="boolean">Sim / não</option><option value="consent">Aceite</option>
      </select></label>
      {selectable.includes(type) && <div className="question-options-editor">
        {options.map((option, index) => <article className="question-option-editor" key={option.id}>
          <strong>Opção {index + 1}</strong>
          <label>Título<input value={option.label} onChange={(e) => updateOption(option.id, { label: e.target.value })} /></label>
          {imageMode && <>
            <label>Descrição (opcional)<textarea value={option.description} maxLength={240} onChange={(e) => updateOption(option.id, { description: e.target.value })} /></label>
            <label>Imagem<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 1000000) { setError("A imagem deve ter no máximo 1 MB."); return; } try { updateOption(option.id, { imageUrl: await fileAsDataUrl(file) }); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Imagem inválida."); } }} /></label>
            {option.imageUrl && <div className="question-option-image-preview"><img src={option.imageUrl} alt={option.alt || `Prévia de ${option.label}`} /><Button type="button" variant="ghost" onClick={() => updateOption(option.id, { imageUrl: "", alt: "" })}>Remover imagem</Button></div>}
            <label>Texto alternativo<input value={option.alt} maxLength={180} onChange={(e) => updateOption(option.id, { alt: e.target.value })} /></label>
          </>}
          {!!paths.length && <label>Caminho de destino<select value={option.pathId ?? ""} onChange={(e) => updateOption(option.id, { pathId: e.target.value || null })}><option value="">Selecione um caminho</option>{paths.map((path) => <option key={path.id} value={path.id}>{path.letter} — {path.name}</option>)}</select></label>}
          <Button type="button" variant="ghost" onClick={() => setOptions((current) => current.filter((item) => item.id !== option.id))}>Remover opção</Button>
        </article>)}
        <Button type="button" variant="outline" onClick={addOption}>Adicionar opção</Button>
      </div>}
      <Button type="button" variant="outline" onClick={() => { try { onSave({ ...field, type, options: selectable.includes(type) ? options : [] }); setError(""); } catch { setError("Confira as alternativas."); } }}>Aplicar tipo e opções</Button>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
