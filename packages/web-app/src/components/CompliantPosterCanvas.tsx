import { useEffect, useRef, useState } from 'react';
import { isBinanceSquareCompliantCopy } from '@pop-box/shared';
import { Download, Copy, Check } from 'lucide-react';
import { useTierVisualMeta } from '../lib/artPack';
import { copyText } from '../lib/clipboard';

interface CompliantPosterCanvasProps {
  rewardPop: string;
  tierId: number;
  platform: 'X' | 'BINANCE_SQUARE' | null;
  postTitle: string;
  fruitSrc: string;
}

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const chars = Array.from(text.trim());
  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < chars.length; i++) {
    const next = current + chars[i];
    if (ctx.measureText(next).width > maxWidth && current.length > 0) {
      // Avoid splitting mid-ASCII word when possible
      const lastSpace = current.lastIndexOf(' ');
      if (lastSpace > current.length - 8 && /[A-Za-z0-9]/.test(chars[i])) {
        lines.push(current.slice(0, lastSpace).trimEnd());
        current = current.slice(lastSpace + 1) + chars[i];
      } else {
        lines.push(current);
        current = chars[i];
      }
      if (lines.length === maxLines - 1) {
        let rest = current + chars.slice(i + 1).join('');
        if (ctx.measureText(rest).width > maxWidth) {
          while (rest.length > 1 && ctx.measureText(`${rest}…`).width > maxWidth) {
            rest = rest.slice(0, -1);
          }
          rest = `${rest}…`;
        }
        lines.push(rest);
        return lines;
      }
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Local Canvas share poster generator with crisp obsidian collector-card styling.
 * Enforces Binance Square compliance: strictly forbids CA, DEX links, and Telegram links/redirects.
 */
export function CompliantPosterCanvas({
  rewardPop,
  tierId,
  platform,
  postTitle,
  fruitSrc,
}: CompliantPosterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const meta = useTierVisualMeta(tierId);

  const shareCopy =
    platform === 'BINANCE_SQUARE'
      ? `刚在 POP 果实 读完「${postTitle.slice(0, 28)}」并答对互动题，解锁 +${rewardPop} $POP 奖励！好内容值得被更多人看见。`
      : `我参与了${meta.name}共读，读完帖子领取了 +${rewardPop} $POP！`;

  const isCompliant = isBinanceSquareCompliantCopy(shareCopy);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = async () => {
      const [template, fruit] = await Promise.all([
        loadImage('/assets/fruit-edition/editorial/poster-base.png'),
        loadImage(fruitSrc),
      ]);
      if (cancelled) return;
      const W = 720, H = 880;
      canvas.width = W;
      canvas.height = H;
      ctx.fillStyle = '#FFF8EC';
      ctx.fillRect(0, 0, W, H);
      if (template) ctx.drawImage(template, 0, 0, W, H);
      if (fruit) ctx.drawImage(fruit, 298, 22, 360, 360);
      ctx.fillStyle = '#171719';
      ctx.font = '900 54px system-ui';
      ctx.fillText(`+${rewardPop} POP`, 60, 505, W - 120);
      ctx.font = 'bold 25px system-ui';
      ctx.fillText(`${meta.name} · ${platform === 'BINANCE_SQUARE' ? '币安广场' : 'X'} 共读奖励`, 60, 555);
      // Post snippet box
      ctx.fillStyle = '#090B10';
      ctx.beginPath();
      ctx.roundRect(48, 583, W - 96, 155, 18);
      ctx.fill();
      ctx.strokeStyle = '#1F2433';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#6B7280';
      ctx.font = '600 20px system-ui, -apple-system, sans-serif';
      ctx.fillText('共读热帖', 75, 630);

      ctx.fillStyle = '#F3F4F6';
      ctx.font = '600 26px system-ui, -apple-system, sans-serif';
      const titleLines = wrapCanvasLines(ctx, postTitle, W - 184, 2);
      titleLines.forEach((line, idx) => {
        ctx.fillText(line, 75, 678 + idx * 40);
      });

      // Divider
      ctx.fillStyle = '#1F2433';
      ctx.fillRect(64, 760, W - 128, 1);

      // Footer (strictly zero CA / DEX / TG)
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '500 20px system-ui, -apple-system, sans-serif';
      ctx.fillText('读好帖 · 答 1 题 · 双向解锁内容激励', 64, 822);
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [rewardPop, platform, postTitle, fruitSrc, meta.name]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `pop-fruit-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const handleCopy = async () => {
    if (!isCompliant) return;
    const ok = await copyText(shareCopy);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-3 text-left">
      <canvas
        ref={canvasRef}
        className="w-full max-w-[192px] mx-auto rounded-xl border border-pop-border"
      />
      <div className="rounded-xl bg-pop-bg border border-pop-border p-3 text-xs text-gray-300 leading-relaxed">
        {shareCopy}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleDownload}
          className="arcade-btn flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs"
        >
          <Download className="w-3.5 h-3.5" /> 保存海报
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!isCompliant}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-pop-elevated border border-pop-borderHover text-white font-semibold py-2.5 text-xs hover:bg-white/10 transition"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-pop-lime" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? '已复制文案' : '复制合规文案'}
        </button>
      </div>
    </div>
  );
}
