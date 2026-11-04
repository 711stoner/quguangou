from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import json,hashlib,re,subprocess,sys
src=Path(__file__).resolve().parent.parent
# Keep store metadata synchronized with the canonical, reviewed SEO copy.
subprocess.run([sys.executable,str(src/"scripts/sync-store-seo.py")],check=True)
destinations=[src/'dist']
# Keep all 11 project region configurations in source. Chromium only lists
# zh_CN and zh_TW as Chinese extension locales: zh_HK is not recognized.
# Hong Kong's UI uses the already supported zh_TW Traditional resources.
languages=('zh_CN','zh_TW','zh_HK','en','ja','ko','fr','es','ms','vi','id')
native_brands=json.loads((src/'本地化产品名称.json').read_text())
chromium_locales=tuple(lang for lang in languages if lang!='zh_HK')
m=json.loads((src/'manifest.json').read_text())
assert re.fullmatch(r'\d+\.\d+\.\d+', m['version']), 'Invalid manifest version'
assert m['default_locale']=='zh_CN'
assert m['name']=='__MSG_extensionName__'
assets=[]
roots=('assets','lib','data','_locales','l10n')
topFiles={'manifest.json','background.js','network-hook.js','popup.html','popup.js','popup.css',
'privacy.html','privacy.css','locale-switch.js','locale-switch.css','locale-redirect.js'}
for f in src.rglob('*'):
 if not f.is_file():continue
 rel=f.relative_to(src)
 # macOS external-drive AppleDouble sidecars are not project files.
 if any(part.startswith('._') for part in rel.parts):continue
 if (len(rel.parts)==1 and rel.name not in topFiles) or (len(rel.parts)>1 and rel.parts[0] not in roots):continue
 if any(x in rel.parts for x in ('__pycache__','dist')):continue
 if rel.suffix.lower() not in ('.js','.json','.css','.html','.svg','.png','.jpg','.jpeg','.webp'):continue
 if rel.name in ('static-strings.json','ui-strings.json'):continue
 assets.append(rel)
assets.sort(key=lambda x:str(x))
for loc in languages:
 path=src/'_locales'/loc/'messages.json'
 assert path.exists(),loc
 msgs=json.loads(path.read_text())
 for key in ['extensionName','extensionDescription','extensionShortName']:
  assert key in msgs and len(msgs[key]['message'])>0,(loc,key)
 # A single metadata source feeds Chrome, Microsoft Edge, and Mozilla AMO.
 # Keep localized names compatible with the stricter Edge/AMO 45-char cap;
 # Chrome Web Store itself supports up to 75. Descriptions cap at 132.
 assert len(msgs['extensionName']['message'])<=45, (loc,'extensionName over Edge/AMO 45-character limit')
 if loc in native_brands:
  assert native_brands[loc]['title']==msgs['extensionName']['message'],(loc,'native language title does not match')
  assert 'Followback Watchdog' not in msgs['extensionName']['message'],(loc,'English brand leaked into localized release')
 assert len(msgs['extensionDescription']['message'])<=132, (loc,'extensionDescription over 132-character limit')
for locale in ['ja','ko','fr','es','ms','vi','id']:
 for name in ['popup.html','ui-runtime.js','ui-error-hook.js','privacy.html']:
  assert (src/'l10n'/locale/name).exists(),(locale,name)
for target in destinations:
 target.mkdir(parents=True,exist_ok=True)
 for browser in ['chrome','edge','firefox']:
  name=f'quguangou-{browser}.zip'
  out=target/name
  # Firefox uses a background module and an action popup, NOT the Chromium
  # sidePanel permission, side_panel manifest field or service_worker key.
  # Keep the existing AMO extension ID, permissions and Firefox data policy
  # declarations from the last accepted release (0.2.65).
  manifest=json.loads(json.dumps(m))
  if browser=='firefox':
   manifest['permissions']=[p for p in manifest['permissions'] if p!='sidePanel']
   manifest.pop('side_panel',None)
   manifest['background']={'scripts':['background.js'],'type':'module'}
   manifest['action']['default_popup']='popup.html'
   manifest['browser_specific_settings']={
    'gecko': {
     'id':'quguangou@zhangan.studio',
     'strict_min_version':'140.0',
     'data_collection_permissions': {'required':['none']}
    },
    'gecko_android': {'strict_min_version':'142.0'}
   }
  with ZipFile(out,'w',ZIP_DEFLATED,compresslevel=9) as archive:
   for rel in assets:
    # The unsupported zh_HK Chrome locale is kept as source/SEO data, but
    # must not be shipped in Chromium release ZIPs. zh_TW is the fallback.
    if browser in ('chrome','edge') and rel.parts[:2]==('_locales','zh_HK'):
     continue
    if str(rel)=='manifest.json':
     archive.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    elif browser=='firefox' and rel.name=='privacy.html':
     page=(src/rel).read_text()
     # Firefox popup builds do not request sidePanel.
     # Remove the Chromium-only permission claim in all 7 privacy pages.
     page,replaced=re.subn(r'<li>\s*<code>sidePanel</code>.*?</li>', '',page,flags=re.S)
     assert replaced==1,(browser,rel,replaced)
     archive.writestr(rel.as_posix(),page)
    else:
     archive.write(src/rel,rel.as_posix())
  with ZipFile(out) as archive:
   assert archive.testzip() is None
   names=archive.namelist()
   assert 'manifest.json' in names
   assert len(names)==len(set(names))
   archived_manifest=json.loads(archive.read('manifest.json'))
   assert archived_manifest['version']==m['version']
   if browser=='firefox':
    assert 'sidePanel' not in archived_manifest['permissions']
    assert 'side_panel' not in archived_manifest
    assert 'default_popup' in archived_manifest['action']
    assert archived_manifest['background']['scripts']==['background.js']
    assert archived_manifest['browser_specific_settings']['gecko']['id']=='quguangou@zhangan.studio'
    for privacy_page in ['privacy.html','l10n/zh-TW/privacy.html','l10n/en/privacy.html','l10n/ja/privacy.html','l10n/ko/privacy.html','l10n/fr/privacy.html','l10n/es/privacy.html','l10n/ms/privacy.html','l10n/vi/privacy.html','l10n/id/privacy.html']:
     assert '<code>sidePanel</code>' not in archive.read(privacy_page).decode(),privacy_page
   else:
    assert 'sidePanel' in archived_manifest['permissions']
    assert archived_manifest['background']['service_worker']=='background.js'
   packaged_locales=languages if browser=='firefox' else chromium_locales
   for lang in packaged_locales:
    assert f'_locales/{lang}/messages.json' in names
   if browser in ('chrome','edge'):
    assert all(not name.startswith('_locales/zh_HK/') for name in names)
    assert '_locales/zh_TW/messages.json' in names
  print('PACKAGE',out,'files',len(names),'size',out.stat().st_size,'sha256',hashlib.sha256(out.read_bytes()).hexdigest()[:24])

# The three fixed filenames are updated in place. No versioned ZIPs are created.
release_parent=Path('/Volumes/15055751248/vibe的脚本/04-发布包')
if release_parent.is_dir():
 from shutil import copyfile
 release_dir=release_parent/'取关狗'
 release_dir.mkdir(parents=True, exist_ok=True)
 for browser in ['chrome','edge','firefox']:
  name=f'quguangou-{browser}.zip'
  original=destinations[0]/name
  published=release_dir/name
  copyfile(original,published)
  assert hashlib.sha256(original.read_bytes()).digest()==hashlib.sha256(published.read_bytes()).digest()
  print('FIXED_RELEASE_UPDATED',published,'version',m['version'])
else:
 print('NOTE: 外置硬盘未连接，只更新了桌面取关狗/dist 下的固定安装包。')
