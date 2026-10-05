import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve as resolvePath,dirname} from 'node:path';
const pgSource=`export class Pool {
 constructor(options){globalThis.__boundary.pools.push(options);}
 on(){return this;}
 async connect(){globalThis.__boundary.connects++;throw new Error('INDEPENDENT_POOL_CONNECT_SENTINEL');}
}`;
const vercelSource=`export function attachDatabasePool(){globalThis.__boundary.attached++;}`;
export async function resolve(specifier,context,nextResolve){
 if(specifier==='pg')return {url:'boundary:pg',shortCircuit:true};
 if(specifier==='@vercel/functions')return {url:'boundary:vercel',shortCircuit:true};
 if(specifier==='./config'&&context.parentURL?.endsWith('/src/server/db.ts'))return {url:pathToFileURL(resolvePath(dirname(fileURLToPath(context.parentURL)),'config.ts')).href,shortCircuit:true};
 return nextResolve(specifier,context);
}
export async function load(url,context,nextLoad){
 if(url==='boundary:pg')return {format:'module',source:pgSource,shortCircuit:true};
 if(url==='boundary:vercel')return {format:'module',source:vercelSource,shortCircuit:true};
 return nextLoad(url,context);
}
