"use client";
import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../../../lib/api";
export default function StaffSetup() {
  const [token,setToken]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
  const captured=useRef(false);
  useEffect(()=>{if(captured.current)return;captured.current=true;setToken(new URLSearchParams(location.hash.slice(1)).get("token") ?? ""); history.replaceState(null,"",location.pathname);},[]);
  return <main className="phone"><div className="screen" style={{justifyContent:"center"}}><span className="brand">Bid<i>Zizi</i></span><h1>{done ? "You’re ready to host." : "Set your staff password"}</h1>{done ? <><p>Your password is saved. Sign in to open Studio.</p><a className="btn primary" href="/studio">Sign in</a></> : <form className="card pad stack" onSubmit={async e=>{e.preventDefault();setBusy(true);setError(""); const r=await api("POST","/api/v1/host/password/set",{token,password}).catch(()=>null); if(r?.ok)setDone(true);else setError(r?errorText(r):"Connection lost. Try again.");setBusy(false);}}><p className="small muted">Use at least 12 characters. This one-time link was shared by your staff colleague.</p><label className="field"><span>New password</span><input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} /></label>{error && <p className="notice error" role="alert">{error}</p>}<button className="btn primary" disabled={busy||!token}>{busy?"Saving…":"Save password"}</button>{!token && <p className="notice warn">Open the complete setup link shared by your colleague. If it has expired, ask them for a new one.</p>}</form>}</div></main>;
}
