import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outfile: 'dist/main.js',
  format: 'esm',
  minify: true,
  sourcemap: false,
  loader: { '.css': 'empty' }
});

const css = readFileSync('src/index.css', 'utf8');
const result = await postcss([tailwindcss, autoprefixer]).process(css, { from: 'src/index.css', to: 'dist/index.css' });
writeFileSync('dist/index.css', result.css);
