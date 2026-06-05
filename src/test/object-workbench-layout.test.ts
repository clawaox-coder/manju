import { describe, expect, it } from 'vitest';
import { getObjectWorkbenchLayoutPrefs } from '@/pages/Canvas/objectWorkbenchLayout';

describe('object workbench layout prefs', () => {
  it('gives storyboard the widest and most cinematic side-open treatment', () => {
    const prefs = getObjectWorkbenchLayoutPrefs('storyboard', 1600, 1000);

    expect(prefs.compact).toBe(false);
    expect(prefs.verticalPlacement).toBe('top-edge');
    expect(prefs.horizontalGap).toBe(20);
    expect(prefs.shellPosture).toBe('panoramic');
    expect(prefs.entryMotion).toBe('spread');
    expect(prefs.width).toBeGreaterThanOrEqual(900);
  });

  it('keeps script and character objects tighter and vertically centered to the node', () => {
    const scriptPrefs = getObjectWorkbenchLayoutPrefs('script', 1600, 1000);
    const characterPrefs = getObjectWorkbenchLayoutPrefs('character', 1600, 1000);
    const storyboardPrefs = getObjectWorkbenchLayoutPrefs('storyboard', 1600, 1000);

    expect(scriptPrefs.verticalPlacement).toBe('centered');
    expect(characterPrefs.verticalPlacement).toBe('centered');
    expect(scriptPrefs.shellPosture).toBe('card');
    expect(characterPrefs.shellPosture).toBe('card');
    expect(scriptPrefs.entryMotion).toBe('lift');
    expect(characterPrefs.entryMotion).toBe('lift');
    expect(scriptPrefs.width).toBeLessThan(storyboardPrefs.width);
    expect(characterPrefs.width).toBeLessThan(storyboardPrefs.width);
  });

  it('keeps system objects compact and biased toward below-node utility placement', () => {
    const prefs = getObjectWorkbenchLayoutPrefs('decision', 1600, 1000);

    expect(prefs.verticalPlacement).toBe('below');
    expect(prefs.shellPosture).toBe('utility');
    expect(prefs.entryMotion).toBe('pop');
    expect(prefs.width).toBeLessThan(getObjectWorkbenchLayoutPrefs('script', 1600, 1000).width);
    expect(prefs.maxHeight).toBeLessThan(getObjectWorkbenchLayoutPrefs('storyboard', 1600, 1000).maxHeight);
    expect(prefs.width).toBeLessThanOrEqual(680);
    expect(prefs.horizontalGap).toBeLessThanOrEqual(10);
  });

  it('falls back to compact centered behavior on small screens regardless of object type', () => {
    const storyboardPrefs = getObjectWorkbenchLayoutPrefs('storyboard', 1100, 900);
    const characterPrefs = getObjectWorkbenchLayoutPrefs('character', 1100, 900);

    expect(storyboardPrefs.compact).toBe(true);
    expect(characterPrefs.compact).toBe(true);
    expect(storyboardPrefs.verticalPlacement).toBe('below');
    expect(characterPrefs.verticalPlacement).toBe('below');
  });
});
