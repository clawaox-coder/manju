import { useRef } from 'react';
import { useEditor, useValue } from 'tldraw';
import { MousePointer2, Hand, ImagePlus, Minus, Plus, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Minimal floating canvas toolbar. tldraw's default UI is hidden (hideUi);
 * this exposes only the controls we want: select, hand (pan), media upload,
 * and a styled zoom control.
 */
export function CanvasToolbar() {
  const editor = useEditor();
  const fileRef = useRef<HTMLInputElement>(null);

  const tool = useValue('tool', () => editor.getCurrentToolId(), [editor]);
  const zoom = useValue('zoom', () => editor.getZoomLevel(), [editor]);

  const pickFiles = () => fileRef.current?.click();
  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) {
      await editor.putExternalContent({
        type: 'files',
        files,
        point: editor.getViewportPageBounds().center,
        ignoreParent: false,
      });
    }
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={onFiles}
      />
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-1 rounded-2xl border border-border bg-background/90 backdrop-blur-md px-1.5 py-1.5 shadow-lg">
        <ToolButton label="选择" active={tool === 'select'} onClick={() => editor.setCurrentTool('select')}>
          <MousePointer2 className="w-[18px] h-[18px]" />
        </ToolButton>
        <ToolButton label="抓手 / 拖动画布" active={tool === 'hand'} onClick={() => editor.setCurrentTool('hand')}>
          <Hand className="w-[18px] h-[18px]" />
        </ToolButton>
        <ToolButton label="连线" active={tool === 'arrow'} onClick={() => editor.setCurrentTool('arrow')}>
          <ArrowRight className="w-[18px] h-[18px]" />
        </ToolButton>
        <ToolButton label="上传图片 / 视频" active={false} onClick={pickFiles}>
          <ImagePlus className="w-[18px] h-[18px]" />
        </ToolButton>
        <div className="mx-1 h-6 w-px bg-border" />
        <ZoomControl zoom={zoom} editor={editor} />
      </div>
    </>
  );
}

function ToolButton({
  label, active, onClick, children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function ZoomControl({
  zoom,
  editor,
}: {
  zoom: number;
  editor: ReturnType<typeof useEditor>;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-muted/50 px-0.5 py-0.5">
      <button
        type="button"
        title="缩小"
        aria-label="缩小"
        onClick={() => editor.zoomOut(undefined, { animation: { duration: 200 } })}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Minus className="w-4 h-4" />
      </button>
      <button
        type="button"
        title="重置缩放"
        aria-label="重置缩放"
        onClick={() => editor.resetZoom(undefined, { animation: { duration: 200 } })}
        className="min-w-[3.25rem] h-8 px-1 rounded-lg text-[12px] font-medium tabular-nums text-foreground hover:bg-accent transition-colors"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        title="放大"
        aria-label="放大"
        onClick={() => editor.zoomIn(undefined, { animation: { duration: 200 } })}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
