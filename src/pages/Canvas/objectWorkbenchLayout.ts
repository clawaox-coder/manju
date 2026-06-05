import type { ManjuNodeType } from './canvas/ManjuNodeUtil';

export type WorkbenchVerticalPlacement = 'top-edge' | 'centered' | 'below';
export type WorkbenchShellPosture = 'panoramic' | 'card' | 'utility';
export type WorkbenchEntryMotion = 'spread' | 'lift' | 'pop';

export type ObjectWorkbenchLayoutPrefs = {
  compact: boolean;
  width: number;
  maxHeight: number;
  horizontalGap: number;
  verticalPlacement: WorkbenchVerticalPlacement;
  shellPosture: WorkbenchShellPosture;
  entryMotion: WorkbenchEntryMotion;
};

export function getObjectWorkbenchLayoutPrefs(
  nodeType: ManjuNodeType | undefined,
  viewportWidth: number,
  viewportHeight: number,
): ObjectWorkbenchLayoutPrefs {
  const compact = viewportWidth < 1260;

  const preferredWideWidth = compact
    ? Math.min(viewportWidth - 24, 940)
    : Math.min(Math.max(820, Math.round(viewportWidth * 0.58)), 980);
  const preferredMediumWidth = compact
    ? Math.min(viewportWidth - 24, 900)
    : Math.min(Math.max(760, Math.round(viewportWidth * 0.53)), 900);
  const preferredTightWidth = compact
    ? Math.min(viewportWidth - 24, 760)
    : Math.min(Math.max(560, Math.round(viewportWidth * 0.34)), 680);

  if (compact) {
    return {
      compact,
      width: nodeType === 'storyboard'
        ? preferredWideWidth
        : nodeType === 'script' || nodeType === 'character'
          ? preferredMediumWidth
          : preferredTightWidth,
      maxHeight: Math.min(viewportHeight - 88, 860),
      horizontalGap: 16,
      verticalPlacement: 'below',
      shellPosture: nodeType === 'storyboard' ? 'panoramic' : nodeType === 'script' || nodeType === 'character' ? 'card' : 'utility',
      entryMotion: nodeType === 'storyboard' ? 'spread' : nodeType === 'script' || nodeType === 'character' ? 'lift' : 'pop',
    };
  }

  if (nodeType === 'storyboard') {
    return {
      compact,
      width: preferredWideWidth,
      maxHeight: Math.min(viewportHeight - 104, 820),
      horizontalGap: 20,
      verticalPlacement: 'top-edge',
      shellPosture: 'panoramic',
      entryMotion: 'spread',
    };
  }

  if (nodeType === 'script' || nodeType === 'character') {
    return {
      compact,
      width: preferredMediumWidth,
      maxHeight: Math.min(viewportHeight - 112, 780),
      horizontalGap: 14,
      verticalPlacement: 'centered',
      shellPosture: 'card',
      entryMotion: 'lift',
    };
  }

  return {
    compact,
    width: preferredTightWidth,
    maxHeight: Math.min(viewportHeight - 132, 660),
    horizontalGap: 10,
    verticalPlacement: 'below',
    shellPosture: 'utility',
    entryMotion: 'pop',
  };
}
