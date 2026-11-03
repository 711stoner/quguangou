#!/usr/bin/env python3
"""Read-only store graphics audit: regional screenshot coverage and actual PNG dimensions.
Does not edit, duplicate, OCR or recreate old image assets.
"""
from pathlib import Path
import struct
root=Path('/Volumes/15055751248/vibe的脚本/04-发布包/取关狗')
assets={
 'zh_CN':{'Chrome':'商店图片-v0.2.55-新版/Chrome','Edge':'Edge商店图片-v0.2.63-中英文完整/中文','Firefox':'商店图片-v0.2.55-新版/Firefox'},
 'zh_TW':{'Chrome':'繁體中文商店圖片-v0.2.65/01-Chrome-繁體','Edge':'繁體中文商店圖片-v0.2.65/02-Edge-繁體','Firefox':'繁體中文商店圖片-v0.2.65/03-Firefox-繁體'},
 'en':{'Chrome':'Global Screenshots - EN','Edge':'Edge商店图片-v0.2.63-中英文完整/English','Firefox':'英文商店截图-v0.2.63-5张'}
}
for language in ['ja','ko','fr','es']:
 assets[language]={b:f'新增四语商店上传图片-v0.2.68/{b}/{language}' for b in ('Chrome','Edge','Firefox')}
for language in ['ms','vi','id']:
 assets[language]={b:f'新增三语商店上传图片-v0.2.70/{b}/{language}' for b in ('Chrome','Edge','Firefox')}
assets['zh_HK']=assets['zh_TW']
def png_size(path):
 with path.open('rb') as f:header=f.read(24)
 if header[:8]!=b'\x89PNG\r\n\x1a\n' or header[12:16]!=b'IHDR':return None
 return struct.unpack('>II',header[16:24])
issues=[]
for lang in ['zh_CN','zh_TW','zh_HK','en','ja','ko','fr','es','ms','vi','id']:
 for browser in ('Chrome','Edge','Firefox'):
  sub=assets[lang][browser];folder=root/sub
  if not folder.exists():issues.append(f'{lang}/{browser}:directory missing {sub}');continue
  files=[f for f in folder.iterdir() if f.is_file() and not f.name.startswith('._') and f.suffix.lower()=='.png']
  sizes={}
  for file in files:
   sz=png_size(file)
   sizes[sz]=sizes.get(sz,0)+1
   if sz is None:issues.append(f'{lang}/{browser}:invalid PNG {file.name}')
  screenshot=sizes.get((1280,800),0)
  if screenshot<1:issues.append(f'{lang}/{browser}:no 1280x800 screenshots')
  if browser=='Chrome' and screenshot>5:issues.append(f'{lang}/{browser}:screenshots {screenshot} (Chrome allows at most 5)')
  print(f'{lang:<6} {browser:<7} 1280x800={screenshot} graphics={len(files)} sizes={sizes} folder={sub}')
print('CONFIGURED_REGIONAL_ASSET_SETS',len(assets)*3,'ISSUES',len(issues))
for issue in issues:print('ISSUE',issue)
if issues:raise SystemExit(1)
