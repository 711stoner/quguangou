#!/usr/bin/env python3
"""Read-only store graphics audit: regional screenshot coverage and actual PNG dimensions.
Does not edit, duplicate, OCR or recreate old image assets.
"""
from pathlib import Path
import struct
from hashlib import sha256
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
chrome_screenshot_hashes={}
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
   if browser=='Chrome' and sz==(1280,800) and lang!='zh_HK':
    digest=sha256(file.read_bytes()).hexdigest()
    chrome_screenshot_hashes.setdefault(digest,[]).append((lang,file.name))
  screenshot=sizes.get((1280,800),0)
  if screenshot<1:issues.append(f'{lang}/{browser}:no 1280x800 screenshots')
  if browser=='Chrome' and screenshot>5:issues.append(f'{lang}/{browser}:screenshots {screenshot} (Chrome allows at most 5)')
  print(f'{lang:<6} {browser:<7} 1280x800={screenshot} graphics={len(files)} sizes={sizes} folder={sub}')
# An exact byte-for-byte reused localized screenshot is a strong signal that
# a language's uploaded screenshot may show another language. Hong Kong uses
# the Taiwan Traditional Chinese source by design and is excluded here.
for digest, records in chrome_screenshot_hashes.items():
 if len({lang for lang,name in records})>1:
  issues.append(f'Cross-language Chrome screenshot duplicate: {records}')
print('CHROME_SCREENSHOT_DISTINCT_LOCALES',len({item[0] for group in chrome_screenshot_hashes.values() for item in group}),
      'CHECKSUM_GROUPS',len(chrome_screenshot_hashes))
print('IMPORTANT: Historic image files may no longer show the current extension UI; size and checksum are NOT visual translation approval.')
print('CONFIGURED_REGIONAL_ASSET_SETS',len(assets)*3,'ISSUES',len(issues))
for issue in issues:print('ISSUE',issue)
if issues:raise SystemExit(1)

# Optional review map for the original Chrome Web Store listing. This file
# documents where the local assets are; it does NOT mark the old images as
# reviewed, published, or matching the current 0.2.75 interface.
if '--report' in __import__('sys').argv:
 report=Path(__file__).resolve().parent.parent/'商店线上语言核验.md'
 assert report.exists(),report
 start='<!-- LOCALIZED_CHROME_IMAGE_REVIEW_START -->'
 end='<!-- LOCALIZED_CHROME_IMAGE_REVIEW_END -->'
 rows=[start,'','## 逐语言 Chrome 截图上传核对（本地素材，不代表已上线）','',
       '10 种界面语言各有 5 张 1280 × 800 的 Chrome 图片，来源目录如下。**这只是原有历史素材，并非 v0.2.75 的最新截图审核通过**。',
       '', '| Chrome 上架语言 | 素材文件夹（发布盘 `取关狗/` 下） | 截图数量 | 内容审核 |',
       '|---|---|---:|---|']
 for lang in ('zh_CN','zh_TW','en','ja','ko','fr','es','ms','vi','id'):
  folder=root/assets[lang]['Chrome']
  found=sorted((f for f in folder.glob('*.png') if not f.name.startswith('._') and png_size(f)==(1280,800)),key=lambda f:f.name)
  assert len(found)==5,(lang,len(found))
  names=', '.join(f'`{f.name}`' for f in found)
  rows.append(f'| `{lang}` | `{assets[lang]["Chrome"]}` | 5 | **待逐张对照最新版**：{names} |')
 rows.extend(['','`zh_HK` 为项目地区兼容配置；Chrome 上架使用 `zh_TW` 的繁体截图，不单独创建 `zh_HK` 商品语言。',
             '', '图片没有跨语言逐字审定；通过尺寸及 SHA-256 不等于完成母语翻译/现行 UI 检查。',
             '', end])
 text='\n'.join(rows)
 current=report.read_text()
 if start in current:
  a=current.index(start);b=current.index(end,a)+len(end)
  current=current[:a]+text+current[b:]
 else:current=current.rstrip()+'\n\n'+text+'\n'
 report.write_text(current)
 print('CHROME_IMAGE_MANUAL_REVIEW_MAP_UPDATED',report)
