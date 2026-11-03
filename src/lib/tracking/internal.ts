import { EventSchema, type FormEvent } from "@/domain/schemas";
import type {
  InternalFormEventRecorder,
  MarketingEventProvider,
} from "@/domain/contracts";
export class MemoryFormEventRecorder implements InternalFormEventRecorder {
  private events: FormEvent[] = [];
  record(input: FormEvent) {
    const event = EventSchema.parse(input);
    if (!this.events.some((e) => e.eventId === event.eventId))
      this.events.push(event);
  }
  list(sessionId: string) {
    return structuredClone(
      this.events.filter((e) => e.sessionId === sessionId),
    );
  }
  clear(sessionId: string) {
    this.events = this.events.filter((e) => e.sessionId !== sessionId);
  }
}
export class DisabledMarketingProvider implements MarketingEventProvider {
  readonly enabled = false as const;
  record(_event: FormEvent) {
    void _event;
  }
}
