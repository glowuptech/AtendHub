"use client";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ScheduleDialog } from "@/features/appointments/components/weekly";
import { Button } from "@/components/ui/button";
import { PersistedLeadDetail } from "./persisted-lead-detail";

export function OpenLead({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" aria-haspopup="dialog" variant="ghost" className={className} onClick={() => setOpen(true)}>{children}</Button>
    {open && createPortal(
      <ScheduleDialog title="Ficha do lead" onClose={() => setOpen(false)} wide>
        <PersistedLeadDetail id={id} embedded />
      </ScheduleDialog>, document.body)}
  </>;
}
