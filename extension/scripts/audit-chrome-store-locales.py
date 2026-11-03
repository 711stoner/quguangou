#!/usr/bin/env python3
"""Read-only check of publicly published Chrome Web Store locale metadata.

Live titles and summaries are observed from the official HTML meta tags.
This script NEVER changes a store listing or claims that ZIP files are published.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import argparse
import html
import json

ROOT = Path(__file__).resolve().parent.parent
CWS_ID = 'ahpjikfghfgekmjcomhcmknlkicloblf'
CASES = [
    ('zh-CN','简体中文','取关狗'),
    ('zh-TW','繁體中文','取關狗'),
    ('en','English','Followback Watchdog'),
    ('ja','日本語','フォローバック確認'),
    ('ko','한국어','맞팔 확인'),
    ('fr','Français','Qui ne me suit pas'),
    ('es','Español','Quién no me sigue'),
    ('ms','Bahasa Melayu','Siapa Tak Follow Balik'),
    ('vi','Tiếng Việt','Ai không theo dõi lại'),
    ('id','Bahasa Indonesia','Cek yang Tidak Follow Back')
]
START_MARK = '<!-- LIVE_CHROME_STORE_LOCALES_START -->'
END_MARK = '<!-- LIVE_CHROME_STORE_LOCALES_END -->'

class StoreMetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = {}
    def handle_starttag(self, tag, attrs):
        if tag != 'meta':
            return
        attributes=dict(attrs)
        key=attributes.get('property') or attributes.get('name')
        if key in ('og:title','description','og:description'):
            self.tags[key]=html.unescape(attributes.get('content',''))

def classify(locale, title, expected_prefix):
    # The suffix " - Chrome ウェブストア" may be Japanese although the
    # *extension name* itself has fallen back to Simplified Chinese.
    product_title = title.rsplit(' - Chrome', 1)[0].strip()
    if expected_prefix in product_title:
        return '对应语言已显示'
    if product_title.startswith('取关狗'):
        return '回退简体中文'
    if product_title.startswith('Followback Watchdog'):
        return '回退英文'
    if product_title.startswith('取關狗'):
        return '回退繁体中文'
    return '其他文案／需人工核对'

def get_current(locale, label, prefix):
    url=f'https://chromewebstore.google.com/detail/{CWS_ID}?hl={locale}'
    try:
        request=Request(url,headers={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36','Cache-Control':'no-cache','Accept-Language':locale})
        with urlopen(request,timeout=18) as response:
            body=response.read(2_000_000).decode('utf-8','replace')
            status=response.status
        parser=StoreMetaParser();parser.feed(body)
        title=parser.tags.get('og:title','')
        description=parser.tags.get('description','')
        if not title or not description:
            raise ValueError('Missing official page meta title or description')
        result=classify(locale,title,prefix)
        return {'locale':locale,'language':label,'url':url,'status':result,'http_status':status,
                'live_title':title,'live_description':description}
    except (HTTPError,URLError,ValueError,TimeoutError,OSError) as error:
        return {'locale':locale,'language':label,'url':url,'status':'查询失败（不能推断本地化状态）',
                'error':str(error)[:230]}

def render_snapshot(results):
    when=datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    lines=[START_MARK,'','## Chrome 商店公开页面语言实时核验','',
           f'只读核验时间：**{when}**。全部链接均为同一个已上架插件 ID `{CWS_ID}`。',
           '',
           '| 要求展示的语言 | Chrome 商店链接 | 当前页面实际标题 | 核验状态 |',
           '|---|---|---|---|']
    for result in results:
        title=result.get('live_title','无法读取').split(' - Chrome',1)[0]
        title=title.replace('|','\\|').replace('\n',' ').strip()
        lines.append(f'| {result["language"]} `{result["locale"]}` | [查看]({result["url"]}) | {title} | {result["status"]} |')
    available=[r for r in results if r['status']=='对应语言已显示']
    fallback=[r for r in results if r['status'].startswith('回退')]
    unavailable=[r for r in results if '查询失败' in r['status']]
    lines.extend(['',f'统计：对应语言显示 **{len(available)}/{len(results)}**；回退其他语言 **{len(fallback)}**；查询失败 **{len(unavailable)}**。',
    '',
    '**重要边界：**这只是查看已公开的商店页面，并不代表登录了开发者后台，也无法用源码修改 Chrome 商店自己的搜索词语言选择。即使扩展包含有完整 `_locales`，商店详情介绍、截图等也要在原商品的开发者后台按语言填写并发布；不能根据本地 ZIP 推断线上已生效。',
    '',END_MARK])
    return '\n'.join(lines)+'\n'

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--report',action='store_true',help='Update the live audit section in the existing publishing report')
    ap.add_argument('--self-test',action='store_true',help='Check the locale classifier offline without network')
    args=ap.parse_args()
    if args.self_test:
        # The localized Chrome storefront suffix must never be mistaken for
        # a Japanese-language product title when the item itself is Chinese.
        assert classify('ja','取关狗｜未回关检测 - Chrome ウェブストア','フォローバック確認')=='回退简体中文'
        assert classify('zh-TW','取關狗｜未回追檢查 - Chrome 線上應用程式商店','取關狗')=='对应语言已显示'
        assert classify('en','Followback Watchdog | Non-Follower Checker for X - Chrome Web Store','Followback Watchdog')=='对应语言已显示'
        assert classify('fr','Followback Watchdog | Non-Follower Checker for X - Chrome Web Store','Qui ne me suit pas')=='回退英文'
        assert len(CASES)==10 and len(set(case[0] for case in CASES))==10
        print('LIVE_LOCALE_CLASSIFIER_OFFLINE_TESTS_PASS')
        return
    results={}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures=[pool.submit(get_current,*case) for case in CASES]
        for future in as_completed(futures):
            r=future.result()
            results[r['locale']]=r
    ordered=[results[case[0]] for case in CASES]
    print(render_snapshot(ordered))
    if args.report:
        report=ROOT/'商店线上语言核验.md'
        assert report.is_file(),report
        source=report.read_text()
        block=render_snapshot(ordered)
        if START_MARK in source:
            begin=source.index(START_MARK)
            end=source.index(END_MARK,begin)+len(END_MARK)
            source=source[:begin]+block.rstrip()+source[end:]
        else:
            source=source.rstrip()+'\n\n'+block
        report.write_text(source)
        print(f'REPORT_UPDATED {report}')
    errors=sum(1 for r in ordered if '查询失败' in r['status'])
    if errors:
        raise SystemExit(f'NOTICE {errors} language queries failed; do not interpret as fallback')

if __name__=='__main__':main()
