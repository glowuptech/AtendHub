import type { FormDefinition } from "@/domain/schemas";

import { completionMessage } from "./completion";

type FormRow = {
  id: string;
  organization_id: string;
  client_id: string;
  doctor_id: string | null;
  name: string;
  description: string;
  slug: string;
  status: string;
  active_version_id: string | null;
  updated_at?: string;
};
type VersionRow = {
  id: string;
  form_id: string;
  organization_id: string;
  client_id: string;
  number: number;
  state: string;
  paths?: unknown;
  choice_assets?: Array<{ id: string; imageUrl?: string; alt?: string }>;
  definition: {
    version?: { paths?: unknown; successMessage?: string };
    fields?: FormDefinition["fields"];
    details?: Pick<
      FormDefinition,
      "name" | "description" | "slug" | "doctorId"
    >;
  };
};

// The authenticated editor can have a newer draft while the patient still sees the active snapshot.
export function persistedForm(
  row: FormRow,
  versions: VersionRow[],
  editor = true,
) {
  const active = versions.find((v) => v.id === row.active_version_id);
  const published = row.status === "demo" && active?.state === "snapshot";
  const draft =
    editor && row.status !== "archived" && active?.state === "snapshot"
      ? versions.find((v) => v.state === "draft" && v.number > active.number)
      : undefined;
  const selected = draft ?? active ?? versions.at(-1);
  const mapped = versions.map((v) => {
    const assets = new Map(
      (v.choice_assets ?? []).map((asset) => [asset.id, asset]),
    );
    const fields = (v.definition.fields ?? []).map((f) => ({
      ...f,
      options: (f.options ?? []).map((option) => ({
        ...option,
        ...assets.get(option.id),
      })),
    }));
    return {
      ...v.definition.version,
      successMessage: completionMessage(v.definition.version?.successMessage),
      id: v.id,
      formId: v.form_id,
      organizationId: v.organization_id,
      clientId: v.client_id,
      number: v.number,
      state: v.state,
      paths: v.definition.version?.paths ?? v.paths ?? [],
      fields,
    };
  });
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    doctorId: row.doctor_id,
    name: row.name,
    description: row.description,
    slug: row.slug,
    ...draft?.definition.details,
    status: row.status,
    activeVersionId: selected?.id,
    versions: mapped,
    fields: mapped.find((v) => v.id === selected?.id)?.fields ?? [],
    ...(editor && {
      publishedSlug: published ? row.slug : null,
      updatedAt: row.updated_at,
    }),
  };
}
