// Runs before the guest app's bundle, in plain ES5, so it works on any phone: it reports errors that happen before the
// app starts (an old browser that can't run the bundle) and, if the app hasn't started after ten seconds, reports that and
// offers simple mode. The app removes all of this as soon as it starts (participant.tsx).
export function earlyScript(code: string): string {
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return "";
  return `(function(){var C="${code}",U="/api/v1/e/"+C+"/telemetry",n=0;
function uuid(){return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c=="x"?r:(r&3|8)).toString(16)})}
function dev(){try{var v=localStorage.getItem("bz_device");if(!v||!/^[0-9a-f-]{36}$/.test(v)){v=uuid();localStorage.setItem("bz_device",v)}return v}catch(e){return window.__bzDevice||(window.__bzDevice=uuid())}}
function send(k,ck,m,d){if(n++>5)return;try{var x=new XMLHttpRequest();x.open("POST",U,true);x.setRequestHeader("Content-Type","application/json");
x.send(JSON.stringify({deviceId:dev(),viewport:Math.round(window.innerWidth)+"x"+Math.round(window.innerHeight),route:(location.pathname).slice(0,200),kind:k,check:ck,message:String(m).slice(0,500),detail:String(d||"").slice(0,1500)}))}catch(e){}}
window.__bzEarly=function(e){if(window.__bzHydrated)return;var m=e&&e.message;if(!m||m=="Script error.")return;send("error",undefined,m,(e.error&&e.error.stack)||(e.filename+":"+e.lineno+":"+e.colno))};
window.addEventListener("error",window.__bzEarly);
setTimeout(function(){if(window.__bzHydrated)return;send("health","app-not-started","The guest app didn't start within 10 seconds","");
var d=document.createElement("div");d.id="bz-stuck";d.setAttribute("role","alert");
d.style.cssText="position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;padding:16px 18px;border-radius:16px;background:#1A1814;color:#FFFCF5;font:16px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.4)";
d.innerHTML='<b style="display:block;margin-bottom:6px">Still loading?</b>This phone may need the simple version. <a href="/e/'+C+'/simple" style="color:#F2B632;font-weight:700">Continue in simple mode</a>';
document.body.appendChild(d)},10000)})();`;
}
