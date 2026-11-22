import fs from 'fs';
import path from 'path';
import {Resvg} from '@resvg/resvg-js';

const rootDir = path.resolve(import.meta.dirname, '..');
const svgPath = path.join(rootDir, 'build', 'icon.svg');
const pngPath = path.join(rootDir, 'build', 'icon.png');

const DEFAULT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#080B14" />
      <stop offset="100%" stop-color="#111936" />
    </linearGradient>
    <linearGradient id="glowBorder" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#22D3EE" />
      <stop offset="55%" stop-color="#6366F1" />
      <stop offset="100%" stop-color="#A855F7" />
    </linearGradient>
    <linearGradient id="keyBaseGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#164E63" />
      <stop offset="100%" stop-color="#3B0764" />
    </linearGradient>
    <linearGradient id="keyFaceGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#06B6D4" />
      <stop offset="50%" stop-color="#3B82F6" />
      <stop offset="100%" stop-color="#8B5CF6" />
    </linearGradient>
    <radialGradient id="haloGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#22D3EE" stop-opacity="0.34" />
      <stop offset="55%" stop-color="#8B5CF6" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#080B14" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect x="32" y="32" width="960" height="960" rx="224" fill="url(#bgGrad)" stroke="#1E293B" stroke-width="8" />
  <circle cx="512" cy="512" r="390" fill="url(#haloGrad)" />
  <rect x="176" y="188" width="672" height="672" rx="140" fill="url(#keyBaseGrad)" stroke="url(#glowBorder)" stroke-width="14" />
  <rect x="224" y="216" width="576" height="548" rx="104" fill="url(#keyFaceGrad)" />
  <rect x="234" y="226" width="556" height="528" rx="96" fill="none" stroke="#E0F2FE" stroke-opacity="0.38" stroke-width="6" />
  <rect x="352" y="344" width="320" height="64" rx="20" fill="#FFFFFF" />
  <rect x="478" y="396" width="68" height="248" rx="20" fill="#FFFFFF" />
  <rect x="444" y="688" width="136" height="14" rx="7" fill="#E0F2FE" fill-opacity="0.72" />
</svg>
`;

let svg;
if (fs.existsSync(svgPath)) {
  svg = fs.readFileSync(svgPath, 'utf8');
} else {
  console.warn(`Source icon SVG not found at ${svgPath}; using built-in default icon SVG.`);
  svg = DEFAULT_ICON_SVG;
}

const resvg = new Resvg(svg, {
  fitTo: {
    mode: 'width',
    value: 1024,
  },
});

const rendered = resvg.render();
const pngBuffer = rendered.asPng();

if (rendered.width !== 1024 || rendered.height !== 1024) {
  console.error(`Expected 1024x1024 icon, got ${rendered.width}x${rendered.height}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(pngPath), {recursive: true});
fs.writeFileSync(pngPath, pngBuffer);
console.log(`Generated ${pngPath} (${rendered.width}x${rendered.height}, ${pngBuffer.byteLength} bytes)`);
