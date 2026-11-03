import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('all npm release commands delegate to the same fixed-zip Python builder',()=>{
 const pkg=JSON.parse(read('package.json'));
 const m=JSON.parse(read('manifest.json'));
 assert.equal(pkg.version,m.version);
 assert.deepEqual(Object.keys(pkg.scripts).sort(),['build','build:chrome','build:edge','build:firefox','test'].sort());
 for(const key of ['build','build:chrome','build:edge','build:firefox'])
  assert.match(pkg.scripts[key],/^node scripts\/build-browser-packages\.mjs/);
 const wrapper=read('scripts/build-browser-packages.mjs');
 assert.match(wrapper,/scripts\/build\.py/);
 assert.match(wrapper,/if\(pkg\.version!==manifest\.version\)/);
 assert.doesNotMatch(wrapper,/quguangou-\$\{browser\}-v/);
 assert.doesNotMatch(wrapper,/\bopera\b/i);
});

test('the only release builder writes three fixed names and omits obsolete Chrome locale zh_HK',()=>{
 const build=read('scripts/build.py');
 assert.match(build,/for browser in \['chrome','edge','firefox'\]/);
 assert.match(build,/name=f'quguangou-\{browser\}\.zip'/);
 assert.match(build,/if browser in \('chrome','edge'\) and rel\.parts\[:2\]==\('_locales','zh_HK'\)/);
 assert.match(build,/if browser=='firefox'/);
 assert.ok(!fs.existsSync(path.join(root,'scripts/build-v0.2.72.py')));
 assert.ok(!fs.existsSync(path.join(root,'manifests/edge.json')));
 assert.ok(!fs.existsSync(path.join(root,'manifests/firefox.json')));
});

test('upload command and all localized store copy use the same release source',()=>{
 const helper=read('更新安装包.command');
 assert.match(helper,/python3 scripts\/build\.py/);
 const seo=JSON.parse(read('商店SEO文案.json'));
 assert.equal(Object.keys(seo).length,11);
 for(const region of Object.keys(seo)){
  assert.ok(seo[region].title.length<=45);
  assert.ok(seo[region].short.length<=132);
 }
});
