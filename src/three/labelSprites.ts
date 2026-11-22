import * as THREE from 'three';

export interface WordLabelOptions {
  text: string;
  typedCount: number;
  isActive: boolean;
  errorFlash?: boolean;
  accentHex?: string;
}

interface PooledLabelEntry {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.SpriteMaterial;
  lastKey: string;
  inUse: boolean;
}

const CANVAS_W = 384;
const CANVAS_H = 96;

/**
 * Pooled Sprite + CanvasTexture manager for arcade game words.
 * Never uses TextGeometry or external fonts, and caches canvases per keystroke:
 * idle words are never redrawn; only the active word canvas updates on keystroke changes.
 */
export class WordSpritePool {
  private entries: PooledLabelEntry[] = [];
  private readonly maxSize: number;

  constructor(initialSize: number = 24, maxSize: number = 64) {
    this.maxSize = maxSize;
    for (let i = 0; i < initialSize; i++) {
      this.entries.push(this.createEntry());
    }
  }

  private createEntry(): PooledLabelEntry {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.scale.set(3.2, 0.8, 1);

    return {
      sprite,
      canvas,
      ctx,
      texture,
      material,
      lastKey: '',
      inUse: false,
    };
  }

  public acquire(parent?: THREE.Object3D): PooledLabelEntry {
    let entry = this.entries.find((e) => !e.inUse);
    if (!entry) {
      if (this.entries.length < this.maxSize) {
        entry = this.createEntry();
        this.entries.push(entry);
      } else {
        entry = this.entries[0];
      }
    }
    entry.inUse = true;
    entry.sprite.visible = true;
    if (parent && entry.sprite.parent !== parent) {
      parent.add(entry.sprite);
    }
    return entry;
  }

  public release(entry: PooledLabelEntry): void {
    entry.inUse = false;
    entry.sprite.visible = false;
    if (entry.sprite.parent) {
      entry.sprite.parent.remove(entry.sprite);
    }
  }

  public updateLabel(entry: PooledLabelEntry, opts: WordLabelOptions): void {
    const typed = Math.max(0, Math.min(opts.text.length, opts.typedCount));
    const accent = opts.accentHex ?? '#22D3EE';
    const key = `${opts.text}|${typed}|${opts.isActive ? 1 : 0}|${opts.errorFlash ? 1 : 0}|${accent}`;
    if (entry.lastKey === key) return;
    entry.lastKey = key;

    const {ctx, canvas, texture} = entry;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const fontSize = opts.text.length > 13 ? 32 : opts.text.length > 9 ? 36 : 42;
    ctx.font = `700 ${fontSize}px ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const textWidth = ctx.measureText(opts.text).width;
    const padX = 24;
    const badgeW = Math.min(canvas.width - 12, Math.max(110, textWidth + padX * 2));
    const badgeH = 66;
    const badgeX = (canvas.width - badgeW) / 2;
    const badgeY = (canvas.height - badgeH) / 2;
    const radius = 14;

    // Rounded dark high-contrast plate
    ctx.beginPath();
    ctx.moveTo(badgeX + radius, badgeY);
    ctx.lineTo(badgeX + badgeW - radius, badgeY);
    ctx.quadraticCurveTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + radius);
    ctx.lineTo(badgeX + badgeW, badgeY + badgeH - radius);
    ctx.quadraticCurveTo(badgeX + badgeW, badgeY + badgeH, badgeX + badgeW - radius, badgeY + badgeH);
    ctx.lineTo(badgeX + radius, badgeY + badgeH);
    ctx.quadraticCurveTo(badgeX, badgeY + badgeH, badgeX, badgeY + badgeH - radius);
    ctx.lineTo(badgeX, badgeY + radius);
    ctx.quadraticCurveTo(badgeX, badgeY, badgeX + radius, badgeY);
    ctx.closePath();

    ctx.fillStyle = opts.errorFlash
      ? 'rgba(127, 29, 29, 0.94)'
      : opts.isActive
        ? 'rgba(8, 15, 32, 0.95)'
        : 'rgba(10, 15, 28, 0.88)';
    ctx.fill();

    ctx.lineWidth = opts.isActive ? 3.5 : 2;
    ctx.strokeStyle = opts.errorFlash
      ? '#FB7185'
      : opts.isActive
        ? accent
        : 'rgba(148, 163, 184, 0.45)';
    ctx.stroke();

    const startX = (canvas.width - textWidth) / 2;
    const centerY = canvas.height / 2 + 1;

    const typedPart = opts.text.slice(0, typed);
    const nextChar = opts.text.slice(typed, typed + 1);
    const restPart = opts.text.slice(typed + 1);

    const drawSegment = (str: string, x: number, fillStyle: string): number => {
      if (!str) return x;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#020617';
      ctx.strokeText(str, x, centerY);
      ctx.fillStyle = fillStyle;
      ctx.fillText(str, x, centerY);
      return x + ctx.measureText(str).width;
    };

    let cursorX = startX;
    cursorX = drawSegment(typedPart, cursorX, '#34D399');
    if (nextChar) {
      cursorX = drawSegment(
        nextChar,
        cursorX,
        opts.errorFlash ? '#FB7185' : opts.isActive ? '#FDE047' : '#F8FAFC',
      );
    }
    drawSegment(restPart, cursorX, '#F8FAFC');

    texture.needsUpdate = true;
  }

  public dispose(): void {
    for (const entry of this.entries) {
      if (entry.sprite.parent) {
        entry.sprite.parent.remove(entry.sprite);
      }
      entry.texture.dispose();
      entry.material.dispose();
    }
    this.entries = [];
  }
}

export type PooledWordLabel = PooledLabelEntry;
