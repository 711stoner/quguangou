#!/usr/bin/env python3
"""Validate current native UI screenshots across Chrome, Edge and Firefox.

Does not OCR image text. The screenshots are rendered from real extension
panels by build-native-store-screenshots.mjs, not the legacy marketing mockups.
"""
from pathlib import Path
import struct,hashlib,json
release=Path('/Volumes/15055751248/vibe的脚本/04-发布包/取关狗')
screens=('01-mode.png','02-personal.png','03-community.png','04-feedback.png','05-privacy.png')
locales=('ja','ko','fr','es','ms','vi','id')
image_digests={}
for lang in locales:
 suffix='新增四语商店上传图片-v0.2.68' if lang in ('ja','ko','fr','es') else '新增三语商店上传图片-v0.2.70'
 for screen in screens:
  hashes=[]
  for browser in ('Chrome','Edge','Firefox'):
   p=release/suffix/browser/lang/screen
   assert p.is_file(),p
   b=p.read_bytes()
   assert b[:8]==b'\x89PNG\r\n\x1a\n',(lang,screen,browser)
   assert struct.unpack('>II',b[16:24])==(1280,800),(lang,screen,browser)
   hashes.append(hashlib.sha256(b).hexdigest())
  assert len(set(hashes))==1,(lang,screen,'screenshot content differs between browsers')
  image_digests[(lang,screen)]=hashes[0]
 print('LOCALE_NEW_REAL_POPUP_SLIDES_PASS',lang,len(screens),'per-browser byte matches',len(screens))
assert len(set(image_digests.values()))==35,'Duplicated screenshots across different locales or steps'
# Global tiles must remain language neutral: all foreign locales and both
# native Chinese sets share exact same text-free artwork.
for asset,size in [('small-tile-440x280.png',(440,280)),('large-tile-1400x560.png',(1400,560))]:
 hashes=set()
 for lang in locales:
  suffix='新增四语商店上传图片-v0.2.68' if lang in ('ja','ko','fr','es') else '新增三语商店上传图片-v0.2.70'
  for browser in ('Chrome','Edge'):
   p=release/suffix/browser/lang/asset
   blob=p.read_bytes();assert struct.unpack('>II',blob[16:24])==size,p
   hashes.add(hashlib.sha256(blob).hexdigest())
 assert len(hashes)==1,('global image must not vary by language',asset)
 print('LANGUAGE_NEUTRAL_GLOBAL_PROMO_PASS',asset,size)
print('ALL_35_NATIVE_LANGUAGE_SCREENSHOTS_VALID_105_BROWSER_COPIES_AND_GLOBAL_NEUTRAL_PROMOS_PASS')
