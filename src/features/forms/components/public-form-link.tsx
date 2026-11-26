"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { rootDomain } from "@/features/client-domains/model";

export function PublicFormLink({
  origin,
  slug,
}: {
  origin?: string | null;
  slug: string;
}) {
  const url = `${origin ?? `https://${rootDomain}`}/f/${encodeURIComponent(slug)}`;
  const [feedback, setFeedback] = useState("");
  return (
    <div className="actions public-form-link">
      <label>
        Link público
        <input
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
        />
      </label>
      <a href={url} target="_blank" rel="noopener noreferrer">
        Abrir formulário
      </a>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setFeedback("Link copiado.");
          } catch {
            setFeedback("Selecione o endereço e copie o link.");
          }
        }}
      >
        Copiar link
      </Button>
      {feedback && <span role="status">{feedback}</span>}
    </div>
  );
}
