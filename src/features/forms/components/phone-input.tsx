"use client";
import type { ComponentProps } from "react";
import { formatPhone } from "@/features/whatsapp/model";
import { normalizeFormPhone } from "../services/phone";

type Props = Pick<
  ComponentProps<"input">,
  "id" | "aria-label" | "aria-describedby" | "aria-invalid"
> & {
  value: string;
  onChange: (value: string) => void;
};

export function FormPhoneInput({ value, onChange, ...props }: Props) {
  return (
    <input
      {...props}
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      placeholder="(11) 98765-4321"
      value={formatPhone(value)}
      onKeyDown={(event) => {
        const input = event.currentTarget;
        const caret = input.selectionStart;
        if (caret === null || caret !== input.selectionEnd) return;
        // Skip mask punctuation when deleting a single digit inside the number.
        let at = caret;
        if (event.key === "Backspace") {
          while (at > 0 && /\D/.test(input.value[at - 1])) at--;
        } else if (event.key === "Delete") {
          while (at < input.value.length && /\D/.test(input.value[at])) at++;
        }
        if (at !== caret) input.setSelectionRange(at, at);
      }}
      onChange={(event) => {
        const input = event.currentTarget;
        const raw = input.value;
        const digits = raw.replace(/\D/g, "");
        // International paste/autofill is accepted only as a complete Brazilian number.
        const international =
          raw.trimStart().startsWith("+") || digits.length > 11;
        const canonical = international ? normalizeFormPhone(raw) : null;
        if (international && !canonical) return;
        const national = canonical ? canonical.slice(3) : digits;
        const formatted = formatPhone(national);
        const trailingDigits = raw
          .slice(input.selectionStart ?? raw.length)
          .replace(/\D/g, "").length;
        let caret = formatted.length;
        let remaining = trailingDigits;
        while (caret > 0 && remaining > 0) {
          if (/\d/.test(formatted[--caret])) remaining--;
        }
        input.value = formatted;
        input.setSelectionRange(caret, caret);
        onChange(formatted);
      }}
    />
  );
}
