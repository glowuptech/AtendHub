"use client";
import type { CSSProperties, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
export function EditorAccordion({
  id,
  number,
  title,
  description,
  color,
  open,
  onToggle,
  children,
}: {
  id: string;
  number: string;
  title: string;
  description: string;
  color: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={`form-editor-block ${open ? "is-open" : ""}`}
      style={{ "--block-color": color } as CSSProperties}
    >
      <h2>
        <button
          type="button"
          id={`block-${id}-title`}
          aria-expanded={open}
          aria-controls={`block-${id}-body`}
          onClick={onToggle}
          className="form-editor-block-toggle"
        >
          <span className="form-editor-block-number">{number}</span>
          <span className="form-editor-block-caption">
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
          <ChevronDown size={19} aria-hidden="true" />
        </button>
      </h2>
      {open && (
        <div
          id={`block-${id}-body`}
          role="region"
          aria-labelledby={`block-${id}-title`}
          className="form-editor-block-body"
        >
          {children}
        </div>
      )}
    </section>
  );
}
