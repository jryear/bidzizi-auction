import assert from 'node:assert/strict';
import { readUserAgent } from '../../src/lib/ua.ts';
const ios='Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const cases=[
 [ios+' Version/16.4 Mobile/15E148 Safari/604.1','Safari','iOS','phone',''],
 [ios+' Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]','iOS WebView','iOS','phone','Facebook'],
 [ios+' Mobile/15E148 Instagram 350','iOS WebView','iOS','phone','Instagram'],
 [ios+' Mobile/15E148 Gmail','iOS WebView','iOS','phone','Gmail'],
 ['Mozilla/5.0 (Linux; Android 12; SM-A135F) AppleWebKit/537.36 SamsungBrowser/18.0 Chrome/102.0 Mobile Safari/537.36','Samsung Internet','Android','phone',''],
 ['Mozilla/5.0 (Linux; Android 10; budget; wv) AppleWebKit/537.36 Chrome/100.0 Mobile Safari/537.36','Android WebView','Android','phone','Android app'],
 ['Mozilla/5.0 (Linux; Android 12; tablet) Chrome/100.0 Safari/537.36','Chrome','Android','tablet',''],
 ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1','Safari','iPadOS','tablet',''],
 ['Mozilla/5.0 (Windows NT 10.0) Gecko Firefox/115.0','Firefox','Windows','desktop',''],
 ['', '', '', '', ''],
];
for(const [ua,browser,os,deviceClass,inApp] of cases){const d=readUserAgent(ua);assert.equal(d.browser,browser);assert.equal(d.os,os);assert.equal(d.deviceClass,deviceClass);assert.equal(d.inApp,inApp);}
console.log(`${cases.length}/${cases.length} device parsing cases passed`);
