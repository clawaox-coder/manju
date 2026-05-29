interface MessageActionProps {
  label: string;
  description: string;
  icon: string;
  onClick: () => void;
}

export function MessageAction({ label, description, icon, onClick }: MessageActionProps) {
  return (
    <button
      className="w-full bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-4 text-left hover:from-primary/15 hover:to-primary/10 transition-all duration-200 active:scale-[0.98]"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-[11px] text-muted-foreground">{description}</div>
        </div>
      </div>
    </button>
  );
}
