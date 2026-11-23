export const endpoint = "/api/paid-media";
export async function requestMedia<T>(
  path: string,
  value?: unknown,
): Promise<T> {
  const res = await fetch(
    path,
    value === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || data === null)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Não foi possível concluir a operação.",
    );
  return data;
}
