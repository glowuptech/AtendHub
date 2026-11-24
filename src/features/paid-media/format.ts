export const displayNumber = (value: number | null) =>
  value === null ? "—" : new Intl.NumberFormat("pt-BR").format(value);

export const money = (value: number | null, currency: string) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
        value,
      );

export const percent = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "percent",
        maximumFractionDigits: 2,
      }).format(value / 100);
