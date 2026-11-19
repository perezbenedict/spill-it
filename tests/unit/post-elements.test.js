import { describe, expect, it } from 'vitest';
import {
  ELEMENT_TEMPLATES,
  ELEMENT_MAX,
  MARGIN,
  applyTemplate,
  createShapeElement,
  createTextElement,
  drawPostElements,
  elementBounds,
  elementCenter,
  elementsFit,
  historyCommit,
  historyInitial,
  historyRedo,
  historyUndo,
  hitTest,
  moveElement,
  resizeElement,
  resizeHandleAt,
  rotateElement,
  rotateHandlePoint,
  rotatePoint,
  snapMove,
} from '../../lib/post-elements';
import { POST_THEMES } from '../../lib/social-posts';

const theme = POST_THEMES[0];
const size = { width: 1080, height: 1350 };

const at = (x, y) => ({ x, y });

describe('element geometry', () => {
  it('rotates points around a center and back', () => {
    const point = rotatePoint(1, 0, 0, 0, 90);
    expect(point.x).toBeCloseTo(0, 10);
    expect(point.y).toBeCloseTo(1, 10);
    const back = rotatePoint(point.x, point.y, 0, 0, -90);
    expect(back.x).toBeCloseTo(1, 10);
    expect(back.y).toBeCloseTo(0, 10);
    expect(rotatePoint(3, 4, 0, 0, 0)).toEqual({ x: 3, y: 4 });
  });

  it('computes rotated axis-aligned bounds', () => {
    const element = { x: 0.4, y: 0.4, w: 0.2, h: 0.1, rotation: 0 };
    const straight = elementBounds(element);
    expect(straight).toEqual({ x: 0.4, y: 0.4, w: 0.2, h: 0.1 });
    const turned = elementBounds({ ...element, rotation: 90 });
    // 90 degrees swaps the contribution of width and height; the center stays put.
    expect(turned.w).toBeCloseTo(0.1, 10);
    expect(turned.h).toBeCloseTo(0.2, 10);
    expect(turned.x).toBeCloseTo(0.45, 10);
    expect(turned.y).toBeCloseTo(0.35, 10);
  });

  it('reports a design as fitting only when every visible element is inside the canvas', () => {
    const inside = createTextElement(theme, { x: 0.1, y: 0.1 });
    const outside = createShapeElement('rect', theme, { x: 0.9, y: 0.9, w: 0.4, h: 0.2 });
    expect(elementsFit([inside], size)).toBe(true);
    expect(elementsFit([inside, outside], size)).toBe(false);
    expect(elementsFit([{ ...outside, visible: false }], size)).toBe(true);
    // A rotated element is checked by its true bounding box.
    const rotatedOut = createTextElement(theme, { x: 0.45, y: 0.02, w: 0.5, h: 0.1, rotation: 45 });
    expect(elementsFit([rotatedOut], size)).toBe(false);
  });
});

describe('hit testing and handles', () => {
  const top = createTextElement(theme, { x: 0.2, y: 0.2, w: 0.4, h: 0.2, rotation: 0 });
  const bottom = createShapeElement('rect', theme, { x: 0.25, y: 0.25, w: 0.3, h: 0.1, rotation: 0 });

  it('returns the topmost element under the pointer', () => {
    expect(hitTest([top, bottom], at(0.4, 0.3), size)).toBe(bottom);
    expect(hitTest([top, bottom], at(0.58, 0.36), size)).toBe(top);
    expect(hitTest([top, bottom], at(0.9, 0.9), size)).toBeNull();
  });

  it('honours visibility and rotated frames', () => {
    expect(hitTest([{ ...bottom, visible: false }, top], at(0.4, 0.3), size)).toBe(top);
    const turned = createTextElement(theme, { x: 0.45, y: 0.05, w: 0.4, h: 0.05, rotation: 90 });
    // The rotated strip covers the vertical corridor through its center.
    expect(hitTest([turned], at(0.65, 0.2), size)).toBe(turned);
    expect(hitTest([turned], at(0.65, 0.35), size)).toBeNull();
  });

  it('finds resize handles only near corners, in the rotated frame', () => {
    expect(resizeHandleAt(top, at(0.2, 0.2), size)).toBe('nw');
    expect(resizeHandleAt(top, at(0.6, 0.4), size)).toBe('se');
    expect(resizeHandleAt(top, at(0.4, 0.3), size)).toBeNull();
    const turned = { ...top, rotation: 90 };
    // After rotating, the stored corner is no longer at the same screen point.
    expect(resizeHandleAt(turned, at(0.2, 0.2), size, 6)).not.toBe('nw');
  });
});

describe('move, snap, resize and rotate', () => {
  it('moves by a delta and stays grabbable near the edges', () => {
    const element = createTextElement(theme, { x: 0.5, y: 0.5 });
    const moved = moveElement(element, 0.1, -0.2);
    expect(moved.x).toBeCloseTo(0.6, 10);
    expect(moved.y).toBeCloseTo(0.3, 10);
    const escaped = moveElement(element, -5, -5);
    expect(escaped.x).toBeGreaterThan(-element.w);
    expect(escaped.y).toBeGreaterThan(-element.h);
  });

  it('snaps edges and center to guides and reports them', () => {
    // Center just off the canvas center: the center edge snaps to 0.5.
    const element = createTextElement(theme, { x: 0.45, y: 0.5, w: 0.1, h: 0.1 });
    const snapped = snapMove(element, 0.005, 0);
    expect(element.x + snapped.dx + element.w / 2).toBeCloseTo(0.5, 10);
    expect(snapped.guides).toContainEqual({ axis: 'x', position: 0.5 });

    // Far from any guide nothing changes and no guides are reported.
    const free = snapMove(createTextElement(theme, { x: 0.2, y: 0.2, w: 0.3, h: 0.15 }), 0.03, 0.03);
    expect(free.dx).toBeCloseTo(0.03, 10);
    expect(free.dy).toBeCloseTo(0.03, 10);
    expect(free.guides).toHaveLength(0);

    // Left edge near the design margin line snaps onto it.
    const margin = snapMove(createTextElement(theme, { x: 0.04, y: 0.2, w: 0.3, h: 0.1 }), 0, 0);
    expect(margin.dx).toBeCloseTo(MARGIN - 0.04, 6);
    expect(margin.guides).toContainEqual({ axis: 'x', position: MARGIN });
  });

  it('resizes from the dragged corner with the opposite corner anchored', () => {
    const element = createTextElement(theme, { x: 0.2, y: 0.2, w: 0.4, h: 0.2, rotation: 0 });
    const grown = resizeElement(element, 'se', at(0.8, 0.7));
    expect(grown.x).toBeCloseTo(0.2, 10);
    expect(grown.y).toBeCloseTo(0.2, 10);
    expect(grown.w).toBeCloseTo(0.6, 10);
    expect(grown.h).toBeCloseTo(0.5, 10);

    const nw = resizeElement(element, 'nw', at(0.1, 0.1));
    expect(nw.x).toBeCloseTo(0.1, 10);
    expect(nw.y).toBeCloseTo(0.1, 10);
    expect(nw.x + nw.w).toBeCloseTo(0.6, 10);
    expect(nw.y + nw.h).toBeCloseTo(0.4, 10);

    // Never collapses below the minimum size.
    const tiny = resizeElement(element, 'se', at(0.201, 0.201));
    expect(tiny.w).toBeGreaterThanOrEqual(0.03);
    expect(tiny.h).toBeGreaterThanOrEqual(0.03);
  });

  it('keeps rotation when resizing a rotated element', () => {
    const element = createTextElement(theme, { x: 0.2, y: 0.2, w: 0.3, h: 0.2, rotation: 30 });
    const resized = resizeElement(element, 'se', at(0.7, 0.6));
    expect(resized.rotation).toBe(30);
    expect(resized.w).toBeGreaterThan(0.03);
    expect(resized.h).toBeGreaterThan(0.03);
  });

  it('rotates from the pointer and snaps to 15 degrees with Shift', () => {
    const element = createTextElement(theme, { x: 0.4, y: 0.4, w: 0.2, h: 0.1 });
    const { cx, cy } = elementCenter(element);
    // Pointing straight down from the center means 180 degrees of rotation.
    const down = rotateElement(element, at(cx, cy + 0.2));
    expect(down.rotation).toBe(180);
    const nudged = rotateElement(element, at(cx + 0.05, cy + 0.19));
    expect(nudged.rotation).not.toBe(180);
    const snapped = rotateElement(element, at(cx + 0.05, cy + 0.19), { shiftKey: true });
    expect(snapped.rotation % 15).toBe(0);
    // Angles stay normalized to [0, 360).
    const wrapped = rotateElement(element, at(cx - 0.2, cy), { shiftKey: true });
    expect(wrapped.rotation).toBeGreaterThanOrEqual(0);
    expect(wrapped.rotation).toBeLessThan(360);
  });

  it('places the rotate handle above the element, rotating with it', () => {
    const element = createTextElement(theme, { x: 0.4, y: 0.4, w: 0.2, h: 0.1, rotation: 0 });
    const handle = rotateHandlePoint(element);
    expect(handle.y).toBeLessThan(element.y);
    const turned = { ...element, rotation: 180 };
    const spun = rotateHandlePoint(turned);
    expect(spun.y).toBeGreaterThan(element.y + element.h);
  });
});

describe('undo and redo history', () => {
  it('commits, undoes and redoes element states', () => {
    let history = historyInitial([1]);
    history = historyCommit(history, [1, 2], 'add');
    history = historyCommit(history, [1, 2, 3], 'add-2');
    expect(history.past).toHaveLength(2);

    history = historyUndo(history);
    expect(history.present).toEqual([1, 2]);
    history = historyUndo(history);
    expect(history.present).toEqual([1]);
    expect(historyUndo(history).present).toEqual([1]); // bottom of the stack

    history = historyRedo(history);
    expect(history.present).toEqual([1, 2]);
    history = historyRedo(history);
    expect(history.present).toEqual([1, 2, 3]);
    expect(historyRedo(history).present).toEqual([1, 2, 3]); // top of the stack
  });

  it('collapses rapid same-token commits into one undo step', () => {
    let history = historyInitial([]);
    history = historyCommit(history, [1], 'typing');
    history = historyCommit(history, [1, 2], 'typing');
    history = historyCommit(history, [1, 2, 3], 'typing');
    // The whole typing burst is one undo step, stored as the pre-burst state.
    expect(history.past).toHaveLength(1);
    expect(history.past[0]).toEqual([]);
    expect(history.present).toEqual([1, 2, 3]);
    // A different token starts a new undo step.
    history = historyCommit(history, [1, 2, 3, 4], 'other');
    expect(history.past).toHaveLength(2);
    history = historyUndo(history);
    expect(history.present).toEqual([1, 2, 3]);
    history = historyUndo(history);
    expect(history.present).toEqual([]); // before the burst
  });

  it('drops the redo stack once a new change is committed', () => {
    let history = historyInitial([0]);
    history = historyCommit(history, [1], 'a');
    history = historyUndo(history);
    expect(history.future).toHaveLength(1);
    history = historyCommit(history, [9], 'b');
    expect(history.future).toHaveLength(0);
    expect(history.present).toEqual([9]);
  });
});

describe('templates', () => {
  it('appends built elements without disturbing existing ones', () => {
    const existing = createTextElement(theme);
    const combined = applyTemplate('quote-sticker', theme, [existing]);
    expect(combined[0]).toBe(existing);
    expect(combined.length).toBeGreaterThan(1);
    expect(combined.every(element => element.id && element.type)).toBe(true);
  });

  it('ignores unknown templates and enforces the element cap', () => {
    expect(applyTemplate('nope', theme, [1, 2])).toEqual([1, 2]);
    const full = Array.from({ length: ELEMENT_MAX }, (_, index) => ({ id: String(index) }));
    expect(applyTemplate('quote-sticker', theme, full)).toBe(full);
  });

  it('offers at least four ready-made arrangements', () => {
    expect(ELEMENT_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    for (const template of ELEMENT_TEMPLATES) {
      const built = template.build(theme);
      expect(built.length).toBeGreaterThan(0);
      expect(built.every(element => typeof element.x === 'number' && element.id)).toBe(true);
    }
  });
});

describe('drawing elements onto a context', () => {
  function recordingContext() {
    const calls = [];
    const record = name => (...args) => calls.push({ name, args });
    return {
      calls,
      save: record('save'),
      restore: record('restore'),
      translate: record('translate'),
      rotate: record('rotate'),
      fillText: record('fillText'),
      fill: record('fill'),
      stroke: record('stroke'),
      beginPath: record('beginPath'),
      ellipse: record('ellipse'),
      rect: record('rect'),
      roundRect: record('roundRect'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      measureText: text => ({ width: String(text).length * 10 }),
      set font(value) { calls.push({ name: 'font', args: [value] }); },
      get font() { return ''; },
      set fillStyle(value) { calls.push({ name: 'fillStyle', args: [value] }); },
      get fillStyle() { return ''; },
      set strokeStyle(value) { calls.push({ name: 'strokeStyle', args: [value] }); },
      get strokeStyle() { return ''; },
      set textAlign(value) { calls.push({ name: 'textAlign', args: [value] }); },
      get textAlign() { return ''; },
      set textBaseline(value) { calls.push({ name: 'textBaseline', args: [value] }); },
      get textBaseline() { return ''; },
      set globalAlpha(value) { calls.push({ name: 'globalAlpha', args: [value] }); },
      get globalAlpha() { return 1; },
      set lineWidth(value) { calls.push({ name: 'lineWidth', args: [value] }); },
      get lineWidth() { return 0; },
    };
  }

  const assets = {
    display: 'DisplayFont',
    body: 'BodyFont',
    comment: { family: 'CommentFont', weight: 600 },
  };
  const env = { theme, assets, width: 1080, height: 1350 };

  it('draws text with its font, rotation and alignment', () => {
    const ctx = recordingContext();
    const element = createTextElement(theme, { text: 'Hello', rotation: 30, align: 'center', role: 'display' });
    const fits = drawPostElements(ctx, [element], env);
    expect(fits).toBe(true);
    const names = ctx.calls.map(call => call.name);
    expect(names).toContain('rotate');
    expect(names).toContain('fillText');
    const rotateCall = ctx.calls.find(call => call.name === 'rotate');
    expect(rotateCall.args[0]).toBeCloseTo((30 * Math.PI) / 180, 10);
    const fontCall = ctx.calls.find(call => call.name === 'font');
    expect(fontCall.args[0]).toContain('DisplayFont');
  });

  it('reports text overflow as a fit failure', () => {
    const ctx = recordingContext();
    const element = createTextElement(theme, {
      text: 'This line is far too long to fit inside such a tiny box ever',
      w: 0.05, h: 0.02, fontSize: 0.08,
    });
    expect(drawPostElements(ctx, [element], env)).toBe(false);
  });

  it('skips hidden elements and handles empty layers', () => {
    const ctx = recordingContext();
    expect(drawPostElements(ctx, [], env)).toBe(true);
    expect(drawPostElements(ctx, null, env)).toBe(true);
    drawPostElements(ctx, [createTextElement(theme, { visible: false })], env);
    expect(ctx.calls.filter(call => call.name === 'fillText')).toHaveLength(0);
  });

  it('draws each shape type with theme colors and opacity', () => {
    const ctx = recordingContext();
    drawPostElements(ctx, [
      createShapeElement('rect', theme, { radius: 0.02 }),
      createShapeElement('ellipse', theme),
      createShapeElement('line', theme, { stroke: 'accent', strokeWidth: 4 }),
    ], env);
    const names = ctx.calls.map(call => call.name);
    expect(names).toContain('roundRect');
    expect(names).toContain('ellipse');
    expect(names).toContain('moveTo');
    expect(names).toContain('lineTo');
    // Theme token colors are resolved to concrete hex values.
    const styles = ctx.calls.filter(call => call.name === 'fillStyle' || call.name === 'strokeStyle').map(call => call.args[0]);
    expect(styles).toContain(theme.accent);
    expect(styles).toContain('transparent');
  });
});
