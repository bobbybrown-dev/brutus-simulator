import * as THREE from 'three';

/** A camera-facing label drawn on a canvas. Call `set` to redraw. */
export class CanvasSprite {
  readonly sprite: THREE.Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;

  constructor(
    private readonly width: number,
    private readonly height: number,
    worldHeight: number,
  ) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true }));
    this.sprite.scale.set((worldHeight * width) / height, worldHeight, 1);
    this.sprite.renderOrder = 10;
  }

  /** Fill the sprite with an image (pixel-art sprites stay crisp), keeping its aspect ratio. */
  drawImage(url: string): void {
    const image = new Image();
    image.onload = () =>
      this.draw((ctx, w, h) => {
        ctx.imageSmoothingEnabled = false;
        const scale = Math.min(w / image.width, h / image.height);
        ctx.drawImage(image, (w - image.width * scale) / 2, (h - image.height * scale) / 2, image.width * scale, image.height * scale);
      });
    image.src = url;
  }

  draw(paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.width, this.height);
    paint(ctx, this.width, this.height);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}

export function drawText(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, colour: string, px = 44): void {
  ctx.font = `bold ${px}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = colour;
  ctx.fillText(text, w / 2, h / 2);
}

export function drawHealthBar(ctx: CanvasRenderingContext2D, w: number, h: number, fraction: number): void {
  ctx.fillStyle = '#7a1414';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2fb84a';
  ctx.fillRect(0, 0, Math.round(w * Math.max(0, Math.min(1, fraction))), h);
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, w, h);
}

/** Hitsplat: red for damage, blue for a block, as in the game. */
export function drawHitsplat(ctx: CanvasRenderingContext2D, w: number, h: number, damage: number): void {
  ctx.fillStyle = damage > 0 ? '#b3261e' : '#2f6fd0';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.stroke();
  drawText(ctx, w, h, String(damage), '#ffffff', 52);
}

/** Overhead Protect from Melee marker: a white shield-and-sword glyph on a dark disc. */
export function drawProtectMelee(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = 'rgba(20,24,40,0.9)';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f2f2f2';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.72);
  ctx.lineTo(w * 0.7, h * 0.28);
  ctx.moveTo(w * 0.3, h * 0.28);
  ctx.lineTo(w * 0.7, h * 0.72);
  ctx.stroke();
}
