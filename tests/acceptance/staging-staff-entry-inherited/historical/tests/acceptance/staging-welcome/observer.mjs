import {prototypeSentinels} from './assertions.mjs';

// Pass a verified REAL Frame from the current same-origin parent/child binding.
// This helper observes DOM/style only; it does not inject payloads or grant access.
export async function observeWelcome(frame){
  return frame.evaluate(sentinels=>{
    const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const visible=el=>{if(!el||!el.isConnected)return false;const r=el.getBoundingClientRect();if(r.width<=0||r.height<=0)return false;for(let e=el;e;e=e.parentElement){const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||parseFloat(s.opacity)===0)return false;}return true;};
    const main=document.querySelector('main.entry'),title=main?.querySelector('h1');
    const hero=main?.querySelector('.event-hero,[aria-labelledby="event-title"]');
    const image=hero?.querySelector('img')||main?.querySelector('.fan img');
    const message=main?.querySelector('.welcome-message'),legacy=main?.querySelector('.studio-welcome');
    const sponsor=main?.querySelector('.welcome-sponsors,.sponsor-row');
    const facts=main?.querySelector('.welcome-facts')||main?.querySelector('.facts');
    const browse=main?.querySelector('[data-key="browse"]');
    const trim=el=>(el?.textContent||'').trim();
    let eyebrow=trim(message?.querySelector('h2'));
    let welcome=trim(message?.querySelector('p'));
    if(!message&&legacy){const strong=legacy.querySelector('strong');eyebrow=trim(strong)||trim(main.querySelector('p.lbl'));const copy=legacy.cloneNode(true);copy.querySelector('strong')?.remove();welcome=trim(copy);}
    const style=title?getComputedStyle(title):null;
    const source=image?.getAttribute('src');
    const coverAsset=source?.match(/(?:^|\/)assets\/lots\/[a-z]+\.jpg$/)?.[0]?.replace(/^\//,'')||null;
    const text=document.body.innerText;
    const titleRect=rect(title);
    return {
      url:location.href,origin:location.origin,path:location.pathname,timeOrigin:performance.timeOrigin,
      viewport:{width:innerWidth,height:innerHeight},main:rect(main),hero:rect(hero),titleBox:titleRect,
      title:trim(title),eyebrow,welcome,coverAsset,coverLoaded:!!image&&image.complete&&image.naturalWidth>0,
      titleVisible:visible(title),messageVisible:visible(message||legacy),coverVisible:visible(image),
      sponsorBlock:!!sponsor,sponsorNames:sponsor?[...sponsor.querySelectorAll('li')].map(li=>trim(li.querySelector('span:last-child'))):[],
      sponsorBox:rect(sponsor),messageBox:rect(message||legacy),factsBox:rect(facts),fanCount:main?.querySelectorAll('.fan').length||0,
      titleClipped:!!style&&(style.textOverflow==='ellipsis'||(style.webkitLineClamp!=='none'&&style.webkitLineClamp!=='0')||(style.overflow!=='visible'&&(title.scrollHeight>title.clientHeight+1||title.scrollWidth>title.clientWidth+1))),
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      browse:browse?{...rect(browse),href:browse.getAttribute('href')}:null,
      prototypeLeaks:sentinels.filter(s=>text.includes(s)||document.documentElement.innerHTML.includes(s)),
      enabledActions:[...document.querySelectorAll('[data-action]')].filter(el=>!el.disabled&&el.getAttribute('aria-disabled')!=='true').map(el=>el.dataset.action),
      enabledDisabledRoutes:[...document.querySelectorAll('a')].filter(a=>/^#\/(?:watching|bids|account)$/.test(a.getAttribute('href')||'')).map(a=>a.getAttribute('href')),
      focused:{tag:document.activeElement.tagName,key:document.activeElement.dataset.key||null,heading:document.activeElement===title},
      fonts:{fraunces:document.fonts.check('16px Fraunces'),instrument:document.fonts.check('16px "Instrument Sans"')}
    };
  },prototypeSentinels);
}
