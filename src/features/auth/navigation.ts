export const appHomePath = "/app/fila";
const localOrigin = "https://atendhub.invalid";

export function afterLoginPath(next: string | null) {
  if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\"))
    return appHomePath;

  let target: URL;
  try {
    target = new URL(next, localOrigin);
  } catch {
    return appHomePath;
  }
  if (target.origin !== localOrigin) return appHomePath;

  const { pathname, search, hash } = target;
  if (pathname === "/login" || pathname === "/login/") return appHomePath;
  if (pathname === "/app" || pathname === "/app/")
    return appHomePath + search + hash;
  return next;
}
