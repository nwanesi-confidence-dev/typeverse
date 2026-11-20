import type {CompletedSessionStats} from '@/src/types/typing';

export function renderCertificateDataUrl(
  stats: CompletedSessionStats,
  profileName: string,
): string | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 990;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Deep slate certificate backdrop
  const grad = ctx.createLinearGradient(0, 0, 1400, 990);
  grad.addColorStop(0, '#080B14');
  grad.addColorStop(1, '#0F172A');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1400, 990);

  // Subtle geometric border frames
  ctx.strokeStyle = '#22D3EE';
  ctx.lineWidth = 4;
  ctx.strokeRect(48, 48, 1304, 894);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(66, 66, 1268, 858);

  // Accent corner brackets
  ctx.fillStyle = '#22D3EE';
  ctx.fillRect(44, 44, 28, 8);
  ctx.fillRect(44, 44, 8, 28);
  ctx.fillRect(1328, 44, 28, 8);
  ctx.fillRect(1348, 44, 8, 28);
  ctx.fillRect(44, 938, 28, 8);
  ctx.fillRect(44, 918, 8, 28);
  ctx.fillRect(1328, 938, 28, 8);
  ctx.fillRect(1348, 918, 8, 28);

  // Header
  ctx.textAlign = 'center';
  ctx.fillStyle = '#22D3EE';
  ctx.font = '600 22px "Outfit", system-ui, sans-serif';
  ctx.fillText('TYPEVERSE TOUCH-TYPING MASTERY', 700, 145);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 54px "Outfit", system-ui, sans-serif';
  ctx.fillText('Certificate of Achievement', 700, 215);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '400 24px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('This certifies that', 700, 288);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 48px "Outfit", system-ui, sans-serif';
  ctx.fillText(profileName || 'Typist', 700, 355);

  ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(420, 378);
  ctx.lineTo(980, 378);
  ctx.stroke();

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '400 23px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    `has completed a verified ${stats.subMode} typing assessment with the following results:`,
    700,
    435,
  );

  // Metric cards row
  const metrics = [
    {label: 'NET SPEED', value: `${stats.netWpm} WPM`, color: '#22D3EE'},
    {label: 'GROSS SPEED', value: `${stats.grossWpm} WPM`, color: '#F8FAFC'},
    {label: 'ACCURACY', value: `${stats.accuracy.toFixed(1)}%`, color: '#34D399'},
    {label: 'CONSISTENCY', value: `${stats.consistency}%`, color: '#FBBF24'},
  ];

  metrics.forEach((m, i) => {
    const x = 140 + i * 285;
    const y = 495;
    ctx.fillStyle = '#111A2E';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, 255, 165, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(m.label, x + 127.5, y + 52);

    ctx.fillStyle = m.color;
    ctx.font = '700 42px "JetBrains Mono", monospace';
    ctx.fillText(m.value, x + 127.5, y + 115);
  });

  // Footer
  const dateStr = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  ctx.fillStyle = '#94A3B8';
  ctx.font = '400 20px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    `Issued ${dateStr}  ·  ${stats.wordsTyped} words typed in ${stats.durationSec}s  ·  ${stats.stars}/3 Mastery Stars`,
    700,
    760,
  );

  ctx.fillStyle = '#64748B';
  ctx.font = '500 18px "JetBrains Mono", monospace';
  ctx.fillText('TYPEVERSE OFFLINE ASSESSMENT ENGINE', 700, 865);

  return canvas.toDataURL('image/png');
}

export function downloadCertificatePng(
  stats: CompletedSessionStats,
  profileName: string,
): void {
  const dataUrl = renderCertificateDataUrl(stats, profileName);
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.download = `typeverse-certificate-${stats.netWpm}wpm.png`;
  link.href = dataUrl;
  link.click();
}
