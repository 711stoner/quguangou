// Backward-compatible npm entry point. All browsers share one build source.
// Do not restore older per-browser manifests or make version-named ZIPs.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8'));
const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
if(pkg.version!==manifest.version)throw new Error(`package.json ${pkg.version} is not manifest.json ${manifest.version}`);
const arg=process.argv[2];
if(arg && !['chrome','edge','firefox'].includes(arg))
 throw new Error(`仅维护 Chrome、Edge、Firefox 三个浏览器：${arg}`);
if(arg)console.log(`当前唯一构建器会同步覆盖三端固定包；请求来源：${arg}`);
const proc=spawnSync('python3',[path.join(root,'scripts/build.py')],{cwd:root,stdio:'inherit'});
if(proc.error)throw proc.error;
if(proc.status!==0)process.exit(proc.status||1);
