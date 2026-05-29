interface OptionPillProps {
  label: string;
  value: string;
  onClick: (value: string) => void;
}

export function OptionPill({ label, value, onClick }: OptionPillProps) {
  return (
    <button
      className="text-[12px] px-3 py-1.5 rounded-full border border-border bg-card hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 active:scale-95"
      onClick={() => onClick(value)}
    >
      {label}
    </button>
  );
}
