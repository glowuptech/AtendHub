export const rootDomain = "atendehub.app";
export const panelDomain = "painel.atendehub.app";
export const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const reserved = [
  "painel",
  "www",
  "api",
  "app",
  "auth",
  "admin",
  "mail",
  "status",
  "assets",
];

export function tenantSlug(host: string | null) {
  const name = host?.toLowerCase().split(":")[0];
  if (!name?.endsWith("." + rootDomain)) return null;
  const slug = name.slice(0, -rootDomain.length - 1);
  return slugPattern.test(slug) && !reserved.includes(slug) ? slug : null;
}
