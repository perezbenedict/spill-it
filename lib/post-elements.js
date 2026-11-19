// Unified element layer for the Post Studio: free-positioned text and shape
// elements drawn over any post layout, with the geometry, snapping, hit
// testing, history and templates kept pure so they can be tested without a
// browser. Coordinates are normalized so a design survives switching between
// Portrait / Vertical / Square: x, y, w, h are fractions of canvas width or
// height, and fontSize is a fraction of canvas width.
import {wrapPostText} from './social-posts';

export const ELEMENT_MAX = 200;
const HISTORY_LIMIT = 60;
const SNAP_THRESHOLD = 0.014;
// The design frame drawn by drawSocialPost sits at 40px on a 1080px canvas.
export const MARGIN = 40 / 1080;

const elementId = () => (globalThis.crypto?.randomUUID?.() ?? `el-${Math.random().toString(36).slice(2)}-${Date.now()}`);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const ELEMENT_COLORS = [
  {id: 'ink', label: 'Theme ink'},
  {id: 'accent', label: 'Theme accent'},
  {id: 'muted', label: 'Theme muted'},
  {id: '#ffffff', label: 'White'},
  {id: '#111111', label: 'Black'},
];

export function elementColor(token, theme) {
  if (token === 'ink') return theme.ink;
  if (token === 'accent') return theme.accent;
  if (token === 'muted') return theme.muted;
  return token;
}

export function createTextElement(theme, overrides = {}) {
  return {
    id: elementId(),
    type: 'text',
    x: 0.12, y: 0.42, w: 0.76, h: 0.12,
    rotation: 0,
    text: 'Your text here',
    fontSize: 0.058,
    weight: 600,
    align: 'left',
    role: 'body',
    color: 'ink',
    opacity: 1,
    locked: false,
    visible: true,
    ...overrides,
  };
}

export function createShapeElement(kind, theme, overrides = {}) {
  const base = {
    id: elementId(),
    type: kind,
    x: 0.2, y: 0.5, w: 0.6, h: 0.1,
    rotation: 0,
    fill: kind === 'line' ? 'transparent' : 'accent',
    stroke: 'transparent',
    strokeWidth: 0,
    radius: kind === 'rect' ? 0.02 : 0,
    opacity: 1,
    locked: false,
    visible: true,
  };
  return {...base, ...overrides};
}

export const ELEMENT_TYPES = [
  {id: 'text', label: 'Text'},
  {id: 'rect', label: 'Rectangle'},
  {id: 'ellipse', label: 'Ellipse'},
  {id: 'line', label: 'Line'},
];

// ---------- geometry (all in normalized units) ----------

export function elementCenter(element) {
  return {cx: element.x + element.w / 2, cy: element.y + element.h / 2};
}

export function rotatePoint(px, py, cx, cy, degrees) {
  if (!degrees) return {x: px, y: py};
  const radians = (degrees * Math.PI) / 180, cos = Math.cos(radians), sin = Math.sin(radians);
  const dx = px - cx, dy = py - cy;
  return {x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos};
}

// Axis-aligned bounds of a rotated rectangle, for fit checks and overlay culling.
export function elementBounds(element) {
  const {cx, cy} = elementCenter(element);
  const radians = (element.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
  const halfW = (element.w * cos + element.h * sin) / 2;
  const halfH = (element.w * sin + element.h * cos) / 2;
  return {x: cx - halfW, y: cy - halfH, w: halfW * 2, h: halfH * 2};
}

export function elementsFit(elements, {width, height}) {
  const toPxX = value => value * width, toPxY = value => value * height;
  return elements.every(element => {
    if (!element.visible) return true;
    const bounds = elementBounds(element);
    return toPxX(bounds.x) >= -1 && toPxY(bounds.y) >= -1 &&
      toPxX(bounds.x + bounds.w) <= width + 1 && toPxY(bounds.y + bounds.h) <= height + 1;
  });
}

// Topmost element at a point (array order is paint order, last wins).
// The hit box is padded so thin lines stay grabbable.
export function hitTest(elements, point, size) {
  const padX = 10 / size.width, padY = 10 / size.height;
  for (let index = elements.length - 1; index >= 0; index--) {
    const element = elements[index];
    if (!element.visible) continue;
    const {cx, cy} = elementCenter(element);
    const local = rotatePoint(point.x, point.y, cx, cy, -element.rotation);
    if (local.x >= element.x - padX && local.x <= element.x + element.w + padX &&
        local.y >= element.y - padY && local.y <= element.y + element.h + padY) return element;
  }
  return null;
}

export function moveElement(element, dx, dy) {
  return {
    ...element,
    x: clamp(element.x + dx, -element.w + 0.02, 0.98),
    y: clamp(element.y + dy, -element.h + 0.02, 0.98),
  };
}

// Guides the element's edges/center can snap to: canvas center, canvas edges
// and the design margin. Returns the corrected delta plus the guide lines to
// draw so snapping is visible instead of mysterious.
export function snapMove(element, dx, dy) {
  const centerX = element.x + dx + element.w / 2, centerY = element.y + dy + element.h / 2;
  const edgesX = [element.x + dx, centerX, element.x + dx + element.w];
  const edgesY = [element.y + dy, centerY, element.y + dy + element.h];
  const guidesX = [0, 0.5, 1, MARGIN, 1 - MARGIN];
  const guidesY = [0, 0.5, 1, MARGIN, 1 - MARGIN];
  let bestX = null, bestY = null;
  for (const guide of guidesX) {
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
      const distance = Math.abs(edgesX[edgeIndex] - guide);
      if (distance <= SNAP_THRESHOLD && (!bestX || distance < bestX.distance)) {
        bestX = {distance, shift: guide - edgesX[edgeIndex], guide};
      }
    }
  }
  for (const guide of guidesY) {
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
      const distance = Math.abs(edgesY[edgeIndex] - guide);
      if (distance <= SNAP_THRESHOLD && (!bestY || distance < bestY.distance)) {
        bestY = {distance, shift: guide - edgesY[edgeIndex], guide};
      }
    }
  }
  return {
    dx: bestX ? dx + bestX.shift : dx,
    dy: bestY ? dy + bestY.shift : dy,
    guides: [
      ...(bestX ? [{axis: 'x', position: bestX.guide}] : []),
      ...(bestY ? [{axis: 'y', position: bestY.guide}] : []),
    ],
  };
}

export const HANDLES = ['nw', 'ne', 'se', 'sw'];
const HANDLE_CORNERS = {
  nw: el => ({x: el.x, y: el.y}),
  ne: el => ({x: el.x + el.w, y: el.y}),
  se: el => ({x: el.x + el.w, y: el.y + el.h}),
  sw: el => ({x: el.x, y: el.y + el.h}),
};

// Corner resize in the element's local (unrotated) frame: the opposite corner
// stays anchored, so rotation is preserved while dragging.
export function resizeElement(element, handle, point) {
  const anchor = HANDLE_CORNERS[handle === 'nw' ? 'se' : handle === 'ne' ? 'sw' : handle === 'sw' ? 'ne' : 'nw'](element);
  const {cx, cy} = elementCenter(element);
  const local = rotatePoint(point.x, point.y, cx, cy, -element.rotation);
  const minSize = 0.03;
  let left = Math.min(anchor.x, local.x), right = Math.max(anchor.x, local.x);
  let top = Math.min(anchor.y, local.y), bottom = Math.max(anchor.y, local.y);
  if (right - left < minSize) right = left + minSize;
  if (bottom - top < minSize) bottom = top + minSize;
  return {...element, x: left, y: top, w: right - left, h: bottom - top};
}

export function resizeHandleAt(element, point, size, threshold = 14) {
  const padX = threshold / size.width, padY = threshold / size.height;
  const {cx, cy} = elementCenter(element);
  const local = rotatePoint(point.x, point.y, cx, cy, -element.rotation);
  for (const handle of HANDLES) {
    const corner = HANDLE_CORNERS[handle](element);
    if (Math.abs(local.x - corner.x) <= padX && Math.abs(local.y - corner.y) <= padY) return handle;
  }
  return null;
}

// Rotation from the pointer, snapped to 15 degrees while Shift is held.
export function rotateElement(element, point, {shiftKey = false} = {}) {
  const {cx, cy} = elementCenter(element);
  const angle = (Math.atan2(point.y - cy, point.x - cx) * 180) / Math.PI;
  let degrees = angle + 90; // the grab handle sits above the element
  if (shiftKey) degrees = Math.round(degrees / 15) * 15;
  degrees = ((Math.round(degrees) % 360) + 360) % 360;
  return {...element, rotation: degrees};
}

export function rotateHandlePoint(element) {
  const {cx, cy} = elementCenter(element);
  const above = rotatePoint(cx, element.y - 0.035, cx, cy, element.rotation);
  return above;
}

// ---------- history (undo / redo) ----------

export function historyInitial(present = []) {
  return {past: [], present, future: [], token: null, at: 0};
}

// commit replaces the present state. With a token, rapid commits sharing the
// token (a slider drag, typing in one field) collapse into one undo step.
export function historyCommit(history, present, token = null) {
  const now = Date.now();
  const coalesce = Boolean(token) && token === history.token && now - history.at < 900;
  if (coalesce) return {...history, present, at: now};
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present,
    future: [],
    token,
    at: now,
  };
}

export function historyUndo(history) {
  if (!history.past.length) return history;
  const past = history.past.slice(0, -1);
  return {past, present: history.past[history.past.length - 1], future: [history.present, ...history.future].slice(0, HISTORY_LIMIT), token: null, at: 0};
}

export function historyRedo(history) {
  if (!history.future.length) return history;
  const [next, ...future] = history.future;
  return {past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future, token: null, at: 0};
}

// ---------- templates ----------

export const ELEMENT_TEMPLATES = [
  {
    id: 'quote-sticker',
    label: 'Quote sticker',
    build: theme => [
      createShapeElement('rect', theme, {x: 0.1, y: 0.36, w: 0.8, h: 0.28, fill: 'accent', radius: 0.03, opacity: 0.16}),
      createTextElement(theme, {x: 0.15, y: 0.41, w: 0.7, h: 0.18, text: '“Say the thing.”', fontSize: 0.062, weight: 700, align: 'center', role: 'display', color: 'ink'}),
    ],
  },
  {
    id: 'headline-band',
    label: 'Headline band',
    build: theme => [
      createShapeElement('rect', theme, {x: 0, y: 0.78, w: 1, h: 0.1, fill: 'accent', opacity: 0.9}),
      createTextElement(theme, {x: 0.08, y: 0.8, w: 0.84, h: 0.06, text: 'BREAKING', fontSize: 0.045, weight: 700, align: 'left', color: '#111111', role: 'body'}),
    ],
  },
  {
    id: 'divider-label',
    label: 'Divider + label',
    build: theme => [
      createShapeElement('line', theme, {x: 0.1, y: 0.5, w: 0.8, h: 0.004, stroke: 'accent', strokeWidth: 3}),
      createTextElement(theme, {x: 0.1, y: 0.52, w: 0.8, h: 0.05, text: 'SPILL IT', fontSize: 0.026, weight: 600, align: 'center', color: 'accent', role: 'body'}),
    ],
  },
  {
    id: 'pill-label',
    label: 'Pill label',
    build: theme => [
      createShapeElement('rect', theme, {x: 0.3, y: 0.12, w: 0.4, h: 0.07, fill: 'accent', radius: 0.035}),
      createTextElement(theme, {x: 0.32, y: 0.135, w: 0.36, h: 0.04, text: 'NEW', fontSize: 0.03, weight: 700, align: 'center', color: '#111111', role: 'body'}),
    ],
  },
  {
    id: 'corner-note',
    label: 'Corner note',
    build: theme => [
      createTextElement(theme, {x: 0.52, y: 0.86, w: 0.42, h: 0.07, text: 'via spill-it', fontSize: 0.024, weight: 500, align: 'right', color: 'muted', role: 'body', rotation: -4}),
    ],
  },
];

export function applyTemplate(templateId, theme, existing = []) {
  const template = ELEMENT_TEMPLATES.find(item => item.id === templateId);
  if (!template) return existing;
  const built = template.build(theme);
  if (existing.length + built.length > ELEMENT_MAX) return existing;
  return [...existing, ...built];
}

// ---------- drawing ----------

const ELEMENT_FONTS = {display: 'display', body: 'body', comment: 'comment'};

function resolveFont(element, assets) {
  const role = ELEMENT_FONTS[element.role] || 'body';
  if (role === 'comment') return {family: assets.comment.family, weight: element.weight || 600};
  return {family: assets[role], weight: element.weight || 600};
}

function drawTextElement(ctx, element, {theme, assets, width, height}) {
  const family = resolveFont(element, assets);
  const fontSize = Math.max(8, element.fontSize * width);
  const lineHeight = fontSize * 1.3;
  const boxW = element.w * width, boxH = element.h * height;
  const cx = (element.x + element.w / 2) * width, cy = (element.y + element.h / 2) * height;
  ctx.save();
  ctx.globalAlpha = clamp(element.opacity ?? 1, 0, 1);
  ctx.translate(cx, cy);
  if (element.rotation) ctx.rotate((element.rotation * Math.PI) / 180);
  ctx.font = `${family.weight} ${fontSize}px ${family.family}`;
  ctx.fillStyle = elementColor(element.color, theme);
  ctx.textBaseline = 'top';
  ctx.textAlign = element.align || 'left';
  const lines = wrapPostText(element.text || '', boxW, value => ctx.measureText(value).width);
  const drawX = element.align === 'center' ? 0 : element.align === 'right' ? boxW / 2 : -boxW / 2;
  const blockTop = -boxH / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, drawX, blockTop + index * lineHeight);
  });
  ctx.restore();
  return lines.length * lineHeight <= boxH + 1;
}

function drawShapeElement(ctx, element, {theme, width, height}) {
  const px = element.x * width, py = element.y * height;
  const boxW = element.w * width;
  const cx = px + boxW / 2, cy = py + Math.max(element.h * height, 1) / 2;  ctx.save();
  ctx.globalAlpha = clamp(element.opacity ?? 1, 0, 1);
  ctx.translate(cx, cy);
  if (element.rotation) ctx.rotate((element.rotation * Math.PI) / 180);
  ctx.fillStyle = element.fill === 'transparent' ? 'transparent' : elementColor(element.fill, theme);
  ctx.strokeStyle = element.stroke === 'transparent' ? 'transparent' : elementColor(element.stroke, theme);
  ctx.lineWidth = element.strokeWidth || 0;
  if (element.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(-boxW / 2, 0);
    ctx.lineTo(boxW / 2, 0);
    ctx.stroke();
  } else if (element.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(0, 0, boxW / 2, Math.max(element.h * height, 1) / 2, 0, 0, Math.PI * 2);
    if (element.fill !== 'transparent') ctx.fill();
    if (element.stroke !== 'transparent' && element.strokeWidth) ctx.stroke();
  } else {
    const radius = Math.min((element.radius || 0) * width, boxW / 2, Math.max(element.h * height, 1) / 2);
    const left = -boxW / 2, top = -Math.max(element.h * height, 1) / 2;
    const w = boxW, h = Math.max(element.h * height, 1);
    ctx.beginPath();
    if (radius > 0 && typeof ctx.roundRect === 'function') ctx.roundRect(left, top, w, h, radius);
    else ctx.rect(left, top, w, h);
    if (element.fill !== 'transparent') ctx.fill();
    if (element.stroke !== 'transparent' && element.strokeWidth) ctx.stroke();
  }
  ctx.restore();
}

// Draws every visible element in paint order. Returns whether all text
// elements' words fit inside their boxes (the studio refuses to export a
// clipped design). Pure side-effect on ctx, so a recording stub can test it.
export function drawPostElements(ctx, elements, env) {
  if (!Array.isArray(elements) || !elements.length) return true;
  let fits = true;
  for (const element of elements) {
    if (!element.visible) continue;
    if (element.type === 'text') fits = drawTextElement(ctx, element, env) && fits;
    else drawShapeElement(ctx, element, env);
  }
  return fits;
}
