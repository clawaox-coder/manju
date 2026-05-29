import type { CardOption } from '../agent/types';

interface MessageCardGroupProps {
  cards: CardOption[];
  onSelect: (id: string) => void;
  selectedId?: string;
}

export function MessageCardGroup({ cards, onSelect, selectedId }: MessageCardGroupProps) {
  if (selectedId) {
    const chosen = cards.find((c) => c.id === selectedId);
    return (
      <div className="text-[12px] text-muted-foreground">
        ✓ 已选择: {chosen?.emoji} {chosen?.title}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
      {cards.map((card) => (
        <button
          key={card.id}
          className="flex-shrink-0 w-[140px] snap-start bg-card border border-border rounded-xl p-3 text-left hover:border-primary/50 hover:shadow-md transition-all duration-200 active:scale-[0.97]"
          onClick={() => onSelect(card.id)}
        >
          {card.emoji && <div className="text-xl mb-1.5">{card.emoji}</div>}
          <div className="text-xs font-semibold mb-0.5">{card.title}</div>
          <div className="text-[10px] text-muted-foreground line-clamp-2">{card.description}</div>
          {card.thumbnail && (
            <img src={card.thumbnail} alt="" className="w-full h-16 object-cover rounded mt-2" />
          )}
        </button>
      ))}
    </div>
  );
}
