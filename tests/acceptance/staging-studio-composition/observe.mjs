export const flush = frame => frame.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
export async function packet(frame) {
  return frame.evaluate(async () => {
    const p = window.__studioPackets?.at(-1)?.payload;
    const d = await import('/staging-bidder-preview/src/data.js');
    const eventKeys=['name','eyebrow','welcome','venue','cover','date','start','end','timezone','increment','sponsorsEnabled','sponsors','id','orgId'],
      lotKeys=['id','title','short','description','category','image','alt','opening','includes','fine','windowId'];
    return { mode:p?.mode, revision:p?.revision, eventId:d.event.id, titles:d.lots.map(l => l.title),
      lotIds:d.lots.map(l => l.id), names:d.event.name, packet:p,
      consumed:{event:Object.fromEntries(eventKeys.map(k=>[k,d.event[k]])),lots:d.lots.map(l=>Object.fromEntries(lotKeys.map(k=>[k,l[k]]))),
        labels:{opens:d.event.opens,closes:d.event.closes,host:d.event.host}} };
  });
}
export async function composition(frame, expected) {
  return frame.evaluate(expected => {
    const clip = element => {
      const range = document.createRange();range.selectNodeContents(element);
      const box = range.getBoundingClientRect();
      if (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) return false;
      for (let p=element;p&&p!==document.body;p=p.parentElement) {
        const s=getComputedStyle(p),r=p.getBoundingClientRect();
        if (['hidden','clip','auto','scroll'].includes(s.overflowX)&&(box.left<r.left-1||box.right>r.right+1)) return false;
        if (['hidden','clip'].includes(s.overflowY)&&(box.top<r.top-1||box.bottom>r.bottom+1)) return false;
      }
      return true;
    };
    return {viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,
      rows:[...document.querySelectorAll('.lot-row')].map((row,index)=>{
        const title=row.querySelector('.title'),photo=row.querySelector('img'),r=photo?.getBoundingClientRect();
        return {title:title?.textContent,expected:expected[row.dataset.id],font:title?parseFloat(getComputedStyle(title).fontSize):0,
          complete:!!title&&clip(title),number:row.querySelector('.lot-number')?.textContent.trim()||'',expectedNumber:String(index+1).padStart(2,'0'),
          photo:{loaded:!!photo?.complete&&photo.naturalWidth>0,width:r?.width||0,height:r?.height||0}};
      })};
  },expected);
}
export async function phone(admin, preview) {
  const outer = await admin.locator('#bidder-frame').evaluate(e => {
    const r=e.getBoundingClientRect();let unscaled=true;
    for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.transform!=='none'||![1,'1','normal'].includes(s.zoom))unscaled=false;}
    return {width:r.width,height:r.height,unscaled};
  });
  const inner = await preview.evaluate(() => ({nativeWidth:innerWidth,nativeHeight:innerHeight,
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1}));
  return {...outer,...inner};
}
export async function checklist(frame) {
  return frame.evaluate(() => {
    const root=document.querySelector('[data-studio-checklist]');
    const name=root?.getAttribute('aria-label')||document.getElementById(root?.getAttribute('aria-labelledby'))?.textContent||'';
    return {present:!!root,accessible:!!root&&(root.tagName==='SECTION'||root.getAttribute('role')==='region')&&name.trim()==='Event setup',
      basis:root?.dataset.basis,text:root?.innerText||'',
      steps:[...(root?.querySelectorAll('[data-setup-step]')||[])].map(row=>({key:row.dataset.setupStep,
        state:row.dataset.state,text:row.innerText,action:!!row.querySelector('button:not([disabled]),a[href]')}))};
  });
}
export async function invalid(frame,selector) {
  return frame.locator(selector).evaluate(e=>{
    const errors=(e.getAttribute('aria-describedby')||'').split(/\s+/).map(id=>document.getElementById(id)).filter(Boolean);
    const error=errors.find(e=>e.getAttribute('role')==='alert'||e.closest('[role="alert"]'));
    return {invalid:e.getAttribute('aria-invalid')==='true',linked:!!error,alert:!!error,
      focused:document.activeElement===e,error:error?.textContent.trim()||'',raw:e.value};
  });
}
export async function reachable(locator) {
  await locator.scrollIntoViewIfNeeded();
  return locator.evaluate(e=>{const r=e.getBoundingClientRect();return {enabled:!e.disabled,
    within:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1,
    hit:e.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2))};});
}
