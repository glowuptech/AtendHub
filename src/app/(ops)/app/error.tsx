"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="empty" role="alert">
      <h1>Não foi possível carregar esta tela</h1>
      <p>Os dados são . Tente novamente.</p>
      <Button onClick={reset}>Tentar novamente</Button>
    </section>
  );
}
