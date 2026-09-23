import { cn } from "@/lib/utils";

/** 34×20 switch — on/off track + sliding knob. Shared by EventsTab's reminder toggle and
 *  EventSettings' "Enable KvK Prep" toggle. Lifted from EventsTab.tsx unchanged. */
export function Switch({
  on,
  disabled,
  title,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  title: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "relative h-5 w-[34px] shrink-0 rounded-full transition-colors duration-150 disabled:opacity-100",
        on ? "bg-up" : "bg-faint",
        disabled ? "cursor-default" : "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all duration-150",
          on ? "start-[16px]" : "start-0.5",
        )}
      />
    </button>
  );
}
