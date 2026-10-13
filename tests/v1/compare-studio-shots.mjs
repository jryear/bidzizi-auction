import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
const root='docs/plans/design-pass-oct19/screenshots';
const prior=process.env.REFERENCE_SHOTS??`${process.env.HOME}/.hermes/projects/bidzizi-20261008/ui-v1-skin-handoff/screenshots/after-copy-9794ffd`;
await mkdir(`${root}/comparisons`,{recursive:true});
for(const width of [390,1440]){
 const panel=width===390?390:720,height=width===390?844:500;
 for(const screen of ['setup','live']){
  const before=await sharp(`${prior}/${width}-admin-${screen==='setup'?'event':'lots'}.png`).resize({width:panel}).toBuffer();
  const after=await sharp(`${root}/studio/studio-${width}-${screen}.png`).resize({width:panel}).toBuffer();
  const crop=async input=>{const m=await sharp(input).metadata();return sharp(input).extract({left:0,top:0,width:panel,height:Math.min(height,m.height)}).extend({bottom:Math.max(0,height-m.height),background:'#f5f0e6'}).toBuffer();};
  const label=Buffer.from(`<svg width="${panel*2+16}" height="38"><rect width="100%" height="100%" fill="#1a1814"/><text x="12" y="25" fill="white" font-family="sans-serif" font-size="14">Previous build · ${width}px</text><text x="${panel+28}" y="25" fill="white" font-family="sans-serif" font-size="14">Real V1 · ${screen} · ${width}px</text></svg>`);
  await sharp({create:{width:panel*2+16,height:height+38,channels:3,background:'#ece5d6'}}).composite([{input:label,top:0,left:0},{input:await crop(before),top:38,left:0},{input:await crop(after),top:38,left:panel+16}]).png().toFile(`${root}/comparisons/studio-${width}-${screen}.png`);
 }
}
console.log('Studio matching-width comparisons written');
