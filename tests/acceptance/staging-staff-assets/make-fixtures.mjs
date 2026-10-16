// Author-time synthetic-file generation only; never called by verification or
// application setup. Committed output bytes, not this script, are test inputs.
import {mkdir,writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {sharp,hash} from './oracles.mjs';
const root=new URL('./fixtures/',import.meta.url);await mkdir(root,{recursive:true});
function crc32(b){let c=0xffffffff;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(name,data){const n=Buffer.from(name),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([n,data])));return Buffer.concat([len,n,data,crc]);}
function png(w,h,animated=false){const hdr=Buffer.alloc(13);hdr.writeUInt32BE(w,0);hdr.writeUInt32BE(h,4);hdr[8]=8;hdr[9]=6;
 const scan=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*(w*4+1)+1+x*4;scan[i]=20;scan[i+1]=90;scan[i+2]=220;scan[i+3]=255;}
 const chunks=[chunk('IHDR',hdr)];if(animated){const act=Buffer.alloc(8);act.writeUInt32BE(2,0);chunks.push(chunk('acTL',act));}
 chunks.push(chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0)));return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),...chunks]);}
const coverPixels=Buffer.alloc(128*64*3);for(let y=0;y<64;y++)for(let x=0;x<128;x++){const i=(y*128+x)*3,color=x<64?[225,45,40]:[30,80,220];coverPixels.set(color,i);}
const cover=await sharp()(coverPixels,{raw:{width:128,height:64,channels:3}}).withMetadata({orientation:6}).jpeg({quality:95}).toBuffer();
const alpha=Buffer.alloc(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4;alpha.set([15,80,180,x>8&&x<56&&y>8&&y<56?255:0],i);}
const sponsor=await sharp()(alpha,{raw:{width:64,height:64,channels:4}}).png().toBuffer();
const item=await sharp()({create:{width:96,height:48,channels:3,background:'#e8b83b'}}).webp({quality:92}).toBuffer();
const frames=Buffer.alloc(20*40*4);for(let y=0;y<40;y++)for(let x=0;x<20;x++)frames.set(y<20?[220,30,20,255]:[20,50,220,255],(y*20+x)*4);
const animated=await sharp()(frames,{raw:{width:20,height:40,channels:4,pageHeight:20}}).webp({loop:0,delay:[100,100]}).toBuffer();
const noise=Buffer.alloc(1600*1600*3);let seed=0x713f46;for(let i=0;i<noise.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;noise[i]=seed&255;}
const outputLimit=await sharp()(noise,{raw:{width:1600,height:1600,channels:3}}).jpeg({quality:55}).toBuffer();
const outputProbe=await sharp()(outputLimit,{failOn:'warning'}).webp({quality:85,alphaQuality:100,effort:4}).toBuffer();
if(outputLimit.length>2097152||outputProbe.length<=1048576)throw new Error('Output-cap fixture does not isolate the intended boundary.');
const files=[
 {name:'cover-exif.jpg',mime:'image/jpeg',bytes:cover,expectedWidth:64,expectedHeight:128,landmarks:[{x:10,y:10,rgba:[225,45,40,255]},{x:10,y:100,rgba:[30,80,220,255]}],purpose:'EXIF6 rotates portrait; all EXIF/ICC stripped'},
 {name:'sponsor-alpha.png',mime:'image/png',bytes:sponsor,expectedWidth:64,expectedHeight:64,alpha:true,landmarks:[{x:32,y:32,rgba:[15,80,180,255]},{x:2,y:2,rgba:[null,null,null,0]}],purpose:'Transparent sponsor, no enlargement'},
 {name:'item.webp',mime:'image/webp',bytes:item,expectedWidth:96,expectedHeight:48,landmarks:[{x:48,y:24,rgba:[232,184,59,255]}],purpose:'WebP accepted and re-encoded'},
 {name:'pixel-boundary.png',mime:'image/png',bytes:png(4000,2000),expectedWidth:1600,expectedHeight:800,purpose:'Exactly8MP valid input; normalized1600 side cap'},
 {name:'side-boundary.png',mime:'image/png',bytes:png(4096,1),expectedWidth:1600,expectedHeight:1,purpose:'Exactly4096px valid input side'},
 {name:'output-limit.jpg',mime:'image/jpeg',bytes:outputLimit,status:413,code:'ASSET_TOO_LARGE',expectedEncodedBytes:outputProbe.length,purpose:'Allowed raw body/pixels exceed normalized1MiB output cap'},
 {name:'apng.png',mime:'image/png',bytes:png(4,4,true),status:415,code:'ASSET_INVALID',purpose:'APNG declaration must reject, never take frame1'},
 {name:'animated.webp',mime:'image/webp',bytes:animated,status:415,code:'ASSET_INVALID',purpose:'Animated WebP rejects'},
 {name:'dimension.png',mime:'image/png',bytes:png(4097,1),status:413,code:'ASSET_TOO_LARGE',purpose:'Decoded side cap exceeded with tiny encoded body'},
 {name:'pixel-limit.png',mime:'image/png',bytes:png(3000,3000),status:413,code:'ASSET_TOO_LARGE',purpose:'9MP exceeds8MP while sides are allowed'},
 {name:'truncated.png',mime:'image/png',bytes:sponsor.subarray(0,sponsor.length-17),status:415,code:'ASSET_INVALID',purpose:'Metadata-only acceptance would be unsafe'},
 {name:'svg.png',mime:'image/png',bytes:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),status:415,code:'ASSET_INVALID',purpose:'Spoofed raster MIME SVG execution rejected'},
 {name:'trailing.png',mime:'image/png',bytes:Buffer.concat([sponsor,Buffer.from('<script>synthetic</script>')]),status:415,code:'ASSET_INVALID',purpose:'Trailing container polyglot rejects'},
];
const manifest=[];for(const {bytes,...row} of files){await writeFile(new URL(row.name,root),bytes);manifest.push({...row,byteLength:bytes.length,sha256:hash(bytes)});}
await writeFile(new URL('manifest.json',root),JSON.stringify({version:1,synthetic:true,generatedWith:'linked sharp0.35.5 + Node zlib',fixtures:manifest},null,2)+'\n');
