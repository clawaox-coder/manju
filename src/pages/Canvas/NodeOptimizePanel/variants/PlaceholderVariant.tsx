// 通用占位:其它变体未实现时显示一行说明,保证外壳不空白。
export function PlaceholderVariant({ text }: { text: string }) {
  return (
    <div className="px-3.5 py-4">
      <p className="text-[12px] text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}
