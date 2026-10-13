#!/usr/bin/env node
// A compatibility gate for browser APIs and CSS fallbacks. Unknown unsupported features fail closed.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { ESLint } from 'eslint';
import postcss from 'postcss';
import doiuse from 'doiuse';
const pkg=JSON.parse(await readFile('package.json','utf8'));
const files=execFileSync('rg',['--files','src'],{encoding:'utf8'}).trim().split('\n');
files.push('public/simple.css', ...process.argv.slice(2));
const lint=new ESLint({overrideConfigFile:'eslint.compat.config.mjs'});
let failures=0,checked=0;
for(const file of files.filter(p=>/\.(tsx|ts)$/.test(p)&&(p.startsWith('src/app/')||p.startsWith('src/lib/')))){
 const source=(await readFile(file,'utf8')).replace(/\/\/ eslint-disable[^\n]*react-hooks\/exhaustive-deps[^\n]*/g,'').replace(/\/\* eslint-disable[^*]*react-hooks\/exhaustive-deps[^*]*\*\//g,'');
 const result=await lint.lintText(source,{filePath:file});for(const r of result){for(const m of r.messages.filter(m=>m.severity===2)){failures++;console.error(`${file}:${m.line}: ${m.message}`);}}checked++;
}
// These unsupported subfeatures are cosmetic, or browser-native behavior remains without them.
const optional={
 'css-overflow':'doiuse reports all overflow declarations for partial clip support; clip itself has a separately enforced hidden fallback.',
 'text-decoration':'Underline thickness/style is decorative; the underline and text remain.',
 'css3-cursors':'Touch engines have no mouse cursor.', 'css3-cursors-grab':'Dragging has pointer/keyboard controls.',
 'css-scrollbar':'Native scrolling remains; scrollbar styling is optional.',
 'css-resize':'Textarea remains usable and scrollable without a resize handle.',
 'css-overscroll-behavior':'Scrolling still works; the bid overlay independently locks the page.',
 'css-color-adjust':'Printing retains content without exact background inks.',
 'multicolumn':'doiuse flags column-gap in grid/flex; those gaps are supported by the targets.',
 'intrinsic-width':'max-content sizing has min-width and overflow constraints.',
 'css-display-contents':'Only the optional mobile detail presentation uses it; content is retained.',
 'css-clip-path':'Decorative silhouettes retain their background and content.',
 'css-masks':'Decorative masks are not required for controls or readable content.',
};
function guarded(node){for(let n=node;n;n=n.parent)if(n.type==='atrule'&&['supports','container'].includes(n.name))return true;return false;}
function fallback(d){if(d.type!=='decl')return false;for(let p=d.prev();p;p=p.prev())if(p.type==='decl'&&p.prop===d.prop&&!/color-mix\(|\d(?:[dsl]vh|[dsl]vw|cqw)|^clip$/.test(p.value))return true;return false;}
for(const file of files.filter(p=>p.endsWith('.css'))){
 const source=await readFile(file,'utf8'),root=postcss.parse(source,{from:file});
 root.walkDecls(d=>{
  if((/color-mix\(|\d(?:[dsl]vh|[dsl]vw|cqw)/.test(d.value)||(/^overflow/.test(d.prop)&&d.value==='clip'))&&!guarded(d)&&!fallback(d)){
   failures++;console.error(`${file}:${d.source.start.line}: ${d.prop}: ${d.value} needs an earlier supported fallback`);
  }
  if(d.prop==='field-sizing'&&!guarded(d)&&!d.parent.nodes.some(n=>n.type==='decl'&&n.prop==='width')){failures++;console.error(`${file}: field-sizing needs a fixed width fallback`);}
 });
 await postcss([doiuse({browsers:pkg.browserslist,onFeatureUsage:u=>{
  const node=u.usage;
  if(optional[u.feature]||guarded(node)||fallback(node))return;
  // Container-responsive enhancements have a viewport-based mobile layout as their baseline.
  if(u.feature==='css-container-queries'&&file.endsWith('/items.css'))return;
  failures++;console.error(u.message);
 }})]).process(root,{from:file});
}
console.log(`Compatibility: ${checked} JS/TS modules; all CSS; ${failures} blocking findings.`);
process.exitCode=failures?1:0;
