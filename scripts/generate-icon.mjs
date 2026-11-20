import fs from 'fs';
import path from 'path';
import {Resvg} from '@resvg/resvg-js';

const rootDir = path.resolve(import.meta.dirname, '..');
const svgPath = path.join(rootDir, 'build', 'icon.svg');
const pngPath = path.join(rootDir, 'build', 'icon.png');

if (!fs.existsSync(svgPath)) {
  console.error(`Missing source icon SVG at ${svgPath}`);
  process.exit(1);
}

const svg = fs.readFileSync(svgPath, 'utf8');
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

fs.writeFileSync(pngPath, pngBuffer);
console.log(`Generated ${pngPath} (${rendered.width}x${rendered.height}, ${pngBuffer.byteLength} bytes)`);
