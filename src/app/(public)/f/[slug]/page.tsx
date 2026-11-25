import { headers } from "next/headers";
import { PublicForm } from "@/features/forms/components/public-form";
import { loadPublicForm } from "@/features/forms/services/public-form-server";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, requestHeaders] = await Promise.all([params, headers()]);
  const form = await loadPublicForm(slug, requestHeaders.get("host"));
  if (!form)
    return (
      <main className="public-page">
        <p role="alert">
          Formulário indisponível. Solicite o link atualizado à equipe de
          atendimento.
        </p>
      </main>
    );
  return <PublicForm key={form.versions[0].id} form={form} />;
}
