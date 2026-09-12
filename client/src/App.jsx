import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cacheAppData, getCachedAppData, getPending, pauseSync, queueInspection, syncPending } from "./offlineDb";
import { requestJson } from "./syncCore.js";
import { createSyncScheduler } from "./syncScheduler.js";

const today=()=>new Date().toISOString().slice(0,10);
const clean=value=>String(value??"").trim()||"UNK";

export default function App(){
  const [tab,setTab]=useState("root"),[photo,setPhoto]=useState(null),[preview,setPreview]=useState("");
  const [records,setRecords]=useState([]),[welders,setWelders]=useState([]),[welderId,setWelderId]=useState("UNK");
  const [manage,setManage]=useState(false),[editing,setEditing]=useState(null),[code,setCode]=useState("");
  const [finalRecord,setFinalRecord]=useState(null),[finalPhoto,setFinalPhoto]=useState(null),[finalPreview,setFinalPreview]=useState(""),[finalWelderId,setFinalWelderId]=useState("UNK");
  const [directPhoto,setDirectPhoto]=useState(null),[directPreview,setDirectPreview]=useState(""),[directWelderId,setDirectWelderId]=useState("UNK");
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [serverAvailable,setServerAvailable]=useState(null),[pending,setPending]=useState([]),[syncing,setSyncing]=useState(false);
  const [ready,setReady]=useState(false),[syncMessage,setSyncMessage]=useState(""),[syncCode,setSyncCode]=useState("");
  const formRef=useRef(null);
  const directFormRef=useRef(null);
  const schedulerRef=useRef(null);
  const pendingViews=useMemo(()=>{
    const urls=[];
    const photoUrl=item=>{if(!(item.photo instanceof Blob))return null;const url=URL.createObjectURL(item.photo);urls.push(url);return url};
    const finalsByClient=new Map(),finalsByRecord=new Map();
    pending.filter(item=>item.type==="final").forEach(item=>{const view={...item,_photoUrl:photoUrl(item)};(item.targetClientId?finalsByClient:finalsByRecord).set(item.targetClientId||item.targetRecordId,view)});
    const applyFinal=(record,item)=>item?{...record,...item.fields,status:"COMPLETE",finalPhotoUrl:item._photoUrl,syncStatus:item.status}:record;
    const roots=pending.filter(item=>item.type==="root").map(item=>applyFinal({id:`local-${item.id}`,_pendingClientId:item.id,status:"AWAITING_FINAL",...item.fields,welderId:item.fields.welderId,finalWelderId:"UNK",finalDate:"UNK",finalVtDate:"UNK",rootPhotoUrl:photoUrl(item),finalPhotoUrl:null,syncStatus:item.status},finalsByClient.get(item.id)));
    const direct=pending.filter(item=>item.type==="final-only").map(item=>({id:`local-${item.id}`,status:"COMPLETE",lineNo:item.fields.lineNo,weldNo:item.fields.weldNo,rework:"N/A",welderId:"N/A",rootDate:"N/A",rootVtDate:"N/A",finalWelderId:item.fields.finalWelderId,finalDate:item.fields.finalDate,finalVtDate:item.fields.finalVtDate,rootPhotoUrl:null,finalPhotoUrl:photoUrl(item),syncStatus:item.status}));
    return {roots,direct,finalsByRecord,finalsByClient,urls};
  },[pending]);
  const localCreates=new Set(pending.filter(item=>item.type!=="final").map(item=>item.id));
  const displayedRecords=[...pendingViews.direct,...pendingViews.roots,...records.filter(r=>!localCreates.has(r.clientRequestId)).map(r=>{const item=pendingViews.finalsByRecord.get(r.id)||pendingViews.finalsByClient.get(r.clientRequestId);return item?{...r,...item.fields,status:"COMPLETE",finalPhotoUrl:item._photoUrl,syncStatus:item.status}:r})];
  const awaiting=displayedRecords.filter(r=>r.status!=="COMPLETE");
  const refreshPending=useCallback(async()=>setPending((await getPending()).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))),[]);
  const refreshLocal=useCallback(async()=>{
    const [items,cached]=await Promise.all([getPending(),getCachedAppData()]);
    setPending(items.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));
    if(cached){setRecords(cached.records||[]);setWelders(cached.welders||[])}
  },[]);
  const load=useCallback(async()=>{
    const [w,i]=await Promise.all([requestJson("/api/welds"),requestJson("/api/welders")]);
    if(!Array.isArray(w.records)||!Array.isArray(i.welders))throw new Error("The server did not return a weld record list.");
    await cacheAppData({records:w.records,welders:i.welders,savedAt:new Date().toISOString()});
    setRecords(w.records);setWelders(i.welders);
  },[]);
  const runSync=useCallback(async(options)=>{
    setSyncing(true);
    try{
      const result=await syncPending(options);
      if(typeof result.serverAvailable==="boolean")setServerAvailable(result.serverAvailable);
      setSyncMessage(result.message||"");setSyncCode(result.code||"");
      await refreshLocal();
      if(result.synced)setNotice(`${result.synced} inspection${result.synced===1?"":"s"} confirmed by the server.`);
      if(result.serverAvailable){
        try{await load()}catch(e){setSyncMessage(`Saved records remain on this device. Could not refresh the server list: ${e.message}`)}
      }
      return result;
    }catch(e){setSyncMessage(e.message||"Sync could not finish. Pending inspections have been kept.");setSyncCode("storage");throw e}
    finally{setSyncing(false)}
  },[load,refreshLocal]);
  useEffect(()=>{
    const onQueue=()=>{refreshLocal().catch(e=>setError(e.message))};
    const onOffline=()=>setServerAvailable(false);
    refreshLocal().then(()=>setReady(true)).catch(e=>setError(e.message)).finally(()=>setLoading(false));
    window.addEventListener("weld-sync-change",onQueue);
    window.addEventListener("offline",onOffline);
    return()=>{window.removeEventListener("weld-sync-change",onQueue);window.removeEventListener("offline",onOffline)};
  },[refreshLocal]);
  useEffect(()=>{
    if(!ready)return;
    const scheduler=createSyncScheduler({run:runSync,pause:pauseSync});
    schedulerRef.current=scheduler;
    return()=>{scheduler.stop();schedulerRef.current=null};
  },[ready,runSync]);
  useEffect(()=>()=>pendingViews.urls.forEach(url=>URL.revokeObjectURL(url)),[pendingViews]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
  useEffect(()=>()=>{if(finalPreview)URL.revokeObjectURL(finalPreview)},[finalPreview]);
  useEffect(()=>()=>{if(directPreview)URL.revokeObjectURL(directPreview)},[directPreview]);
  const pick=(file,setFile,setUrl,oldUrl)=>{if(!file)return;if(oldUrl)URL.revokeObjectURL(oldUrl);setFile(file);setUrl(URL.createObjectURL(file));setError("")};
  const reset=()=>{formRef.current?.reset();if(preview)URL.revokeObjectURL(preview);setPhoto(null);setPreview("");setWelderId("UNK")};
  const saveRoot=async e=>{e.preventDefault();if(!photo){setError("Take or choose a root inspection photo first.");return}setSaving(true);setError("");setNotice("");const raw=new FormData(e.currentTarget),fields={};["lineNo","weldNo","rework","rootDate","rootVtDate"].forEach(k=>fields[k]=clean(raw.get(k)));fields.welderId=welderId;try{await queueInspection("root",fields,photo);reset();await refreshPending();setNotice(`Root inspection for weld ${fields.weldNo} saved on this phone — pending sync.`);setTab("awaiting")}catch(e){setError(e.message)}finally{setSaving(false)}};
  const openFinal=record=>{setFinalRecord(record);setFinalWelderId(record.welderId||"UNK")};
  const saveFinal=async e=>{e.preventDefault();if(!finalPhoto){setError("Take or choose a final inspection photo.");return}setSaving(true);setError("");const raw=new FormData(e.currentTarget),fields={lineNo:finalRecord.lineNo,weldNo:finalRecord.weldNo,finalDate:clean(raw.get("finalDate")),finalVtDate:clean(raw.get("finalVtDate")),finalWelderId};try{await queueInspection("final",fields,finalPhoto,finalRecord._pendingClientId||null,finalRecord._pendingClientId?null:finalRecord.id);const weldNo=finalRecord.weldNo;closeFinal();await refreshPending();setNotice(`Final inspection for weld ${weldNo} saved on this phone — pending sync.`);setTab("records")}catch(e){setError(e.message)}finally{setSaving(false)}};
  const closeFinal=()=>{if(finalPreview)URL.revokeObjectURL(finalPreview);setFinalRecord(null);setFinalPhoto(null);setFinalPreview("");setFinalWelderId("UNK")};
  const resetDirect=()=>{directFormRef.current?.reset();if(directPreview)URL.revokeObjectURL(directPreview);setDirectPhoto(null);setDirectPreview("");setDirectWelderId("UNK")};
  const saveDirect=async e=>{e.preventDefault();if(!directPhoto){setError("Take or choose a final inspection photo.");return}setSaving(true);setError("");setNotice("");const raw=new FormData(e.currentTarget),fields={};["lineNo","weldNo","finalDate","finalVtDate"].forEach(k=>fields[k]=clean(raw.get(k)));fields.finalWelderId=directWelderId;try{await queueInspection("final-only",fields,directPhoto);resetDirect();await refreshPending();setNotice(`Final-only inspection for weld ${fields.weldNo} saved on this phone — pending sync.`);setTab("records")}catch(e){setError(e.message)}finally{setSaving(false)}};
  const removeRecord=async id=>{if(!confirm("Delete this weld record and all of its photos?"))return;const response=await fetch(`/api/welds/${id}`,{method:"DELETE"});if(response.ok)setRecords(records.filter(r=>r.id!==id))};
  const saveWelder=async()=>{if(!code.trim())return;const url=editing?`/api/welders/${editing}`:"/api/welders",method=editing?"PATCH":"POST";const response=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify({code})}),data=await response.json();if(!response.ok){setError(data.error);return}const next=editing?welders.map(w=>w.id===editing?data.welder:w):[...welders,data.welder];setWelders(next.sort((a,b)=>a.code.localeCompare(b.code)));setCode("");setEditing(null)};
  const removeWelder=async id=>{if(!confirm("Remove this welder ID? Existing records will not change."))return;const response=await fetch(`/api/welders/${id}`,{method:"DELETE"});if(response.ok)setWelders(welders.filter(w=>w.id!==id))};
  const csv=useMemo(()=>{const headers=["LINE_NO","WELD_NO","ROOT_DATE","ROOT_VT_DATE","ROOT_WELDER_ID","FINAL_WELDER_ID","DATE","FINAL_VT_DATE"];const quote=v=>`"${clean(v).replaceAll('"','""')}"`;return new File(["\ufeff"+headers.join(",")+"\r\n"+records.map(r=>[r.lineNo,r.weldNo,r.rootDate,r.rootVtDate,r.welderId,r.finalWelderId,r.finalDate,r.finalVtDate].map(quote).join(",")).join("\r\n")],`weld-log-${today()}.csv`,{type:"text/csv;charset=utf-8"})},[records]);
  const download=()=>{const url=URL.createObjectURL(csv),a=document.createElement("a");a.href=url;a.download=csv.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500)};
  const downloadPdf=()=>{window.location.href="/api/export/pdf"};
  const share=async()=>{if(navigator.canShare?.({files:[csv]}))await navigator.share({title:"Weld Photo Log",files:[csv]});else{download();location.href="mailto:?subject=Weld%20Photo%20Log&body=Attach%20the%20downloaded%20CSV%20file."}};

  return <main><header><div className="brand"><span className="logo">◉</span><div><h1>Weld Photo Log</h1><small>Root and final inspection tracker · Sync fix 1.1.1</small></div></div><b>{displayedRecords.length} welds</b></header>
    <div className="shell"><div className={`connection ${serverAvailable?"online":"offline"}`} role="status"><span>{syncing?"Connecting / syncing…":serverAvailable?"Server connected":serverAvailable===null?"Checking server…":"Server unavailable"}</span><b>{!ready?(loading?"Reading phone storage…":"Phone storage unavailable"):pending.length?`${pending.length} pending upload${pending.length===1?"":"s"}`:"All inspections synced"}</b><button onClick={()=>schedulerRef.current?.retry()} disabled={syncing||!ready}>Sync now</button></div>
      {pending.length>0&&<div className="sync-help">Keep this app open while syncing. It retries automatically (up to 60 seconds between retries) and when you return to it. Do not clear website data.</div>}
      {syncMessage&&<div className="alert error" role="alert">{syncMessage}{["auth","unexpected-response"].includes(syncCode)&&<p><a href="/api/health" target="_blank" rel="noreferrer">Open server / sign in again</a>, then return here and tap Sync now.</p>}</div>}
      {pending.length>0&&<details className="pending-details"><summary>Pending uploads ({pending.length}) — show status / errors</summary>{pending.map(item=><div key={item.id}><strong>{item.type.toUpperCase()} · Weld {item.fields?.weldNo||"UNK"}</strong><span>{item.status==="syncing"?(syncing?"Uploading…":"Waiting to retry"):item.retryable===false?"Needs attention — tap Sync now to retry":"Saved on this device — waiting to sync"}</span>{item.error&&<p>{item.error}</p>}<small>Request {item.id} · {item.attempts||0} attempt(s)</small></div>)}</details>}
      {error&&<div className="alert error">× {error}</div>}{notice&&<div className="alert success">✓ {notice}</div>}
      <nav className="four-tabs"><button className={tab==="root"?"active":""} onClick={()=>setTab("root")}>◉ Root</button><button className={tab==="final"?"active":""} onClick={()=>setTab("final")}>Final Only</button><button className={tab==="awaiting"?"active":""} onClick={()=>setTab("awaiting")}>Awaiting ({awaiting.length})</button><button className={tab==="records"?"active":""} onClick={()=>setTab("records")}>Records ({displayedRecords.length})</button></nav>
      {tab==="root"&&<form ref={formRef} onSubmit={saveRoot} className="capture-grid">
        <section className="card"><h2>1. Root inspection photo</h2><div className="card-body"><label className="photo">{preview?<img src={preview} alt="Selected root inspection"/>:<><span className="camera">▣</span><strong>Take root photo</strong><small>or choose one from your phone</small></>}<input type="file" accept="image/*" capture="environment" onChange={e=>pick(e.target.files?.[0],setPhoto,setPreview,preview)}/>{preview&&<em>Tap to retake</em>}</label></div></section>
        <section className="card"><h2>2. Root weld details <small>The final inspection will reuse the line and weld numbers.</small></h2><div className="fields"><Field label="Line number" name="lineNo" inputMode="numeric" placeholder="e.g. 4196"/><Field label="Weld number" name="weldNo" inputMode="numeric" placeholder="e.g. 4062"/><label><span>Root welder ID <button type="button" className="link" onClick={()=>setManage(true)}>⚙ Manage list</button></span><select value={welderId} onChange={e=>setWelderId(e.target.value)}><option value="UNK">UNK — Unknown</option>{welders.map(w=><option key={w.id} value={w.code}>{w.code}</option>)}</select></label><Field label="Rework" name="rework" placeholder="e.g. R1 or leave blank"/><Field label="Root date" name="rootDate" type="date"/><Field label="Root VT date" name="rootVtDate" type="date" defaultValue={today()}/></div><div className="actions"><button type="button" className="secondary" onClick={reset}>↻</button><button disabled={saving} className="primary">{saving?"Saving…":"✓ Save root inspection"}</button></div></section>
      </form>}
      {tab==="final"&&<form ref={directFormRef} onSubmit={saveDirect} className="capture-grid">
        <section className="card"><h2>1. Final inspection photo</h2><div className="card-body"><div className="info-note">Use this menu when no root inspection was recorded. Root fields will be saved as N/A.</div><label className="photo">{directPreview?<img src={directPreview} alt="Selected final inspection"/>:<><span className="camera">▣</span><strong>Take final photo</strong><small>or choose one from your phone</small></>}<input type="file" accept="image/*" capture="environment" onChange={e=>pick(e.target.files?.[0],setDirectPhoto,setDirectPreview,directPreview)}/>{directPreview&&<em>Tap to retake</em>}</label></div></section>
        <section className="card"><h2>2. Final weld details <small>Root inspection fields will be recorded as N/A.</small></h2><div className="fields"><Field label="Line number" name="lineNo" inputMode="numeric" placeholder="e.g. 4196"/><Field label="Weld number" name="weldNo" inputMode="numeric" placeholder="e.g. 4062"/><label><span>Final welder ID <button type="button" className="link" onClick={()=>setManage(true)}>⚙ Manage list</button></span><select value={directWelderId} onChange={e=>setDirectWelderId(e.target.value)}><option value="UNK">UNK — Unknown</option>{welders.map(w=><option key={w.id} value={w.code}>{w.code}</option>)}</select></label><Field label="Final weld date" name="finalDate" type="date"/><Field label="Final VT date" name="finalVtDate" type="date" defaultValue={today()}/></div><div className="actions"><button type="button" className="secondary" onClick={resetDirect}>↻</button><button disabled={saving} className="primary">{saving?"Saving…":"✓ Save final-only inspection"}</button></div></section>
      </form>}
      {tab==="awaiting"&&<section>{loading&&!awaiting.length?<p className="empty">Loading…</p>:!awaiting.length?<p className="empty">No welds are waiting for final inspection.</p>:<div className="records">{awaiting.map(r=><WeldCard key={r.id} record={r} onFinal={()=>openFinal(r)} onDelete={r.syncStatus?null:()=>removeRecord(r.id)}/>)}</div>}</section>}
      {tab==="records"&&<section><div className="export"><button onClick={download} disabled={!records.length}>↓ Export CSV</button><button onClick={downloadPdf} disabled={!records.length}>▣ Export PDF + Photos</button><button onClick={share} disabled={!records.length}>↗ Share / Email</button></div>{loading&&!displayedRecords.length?<p className="empty">Loading…</p>:!displayedRecords.length?<p className="empty">No weld records yet.</p>:<div className="records">{displayedRecords.map(r=><WeldCard key={r.id} record={r} onFinal={r.status!=="COMPLETE"?()=>openFinal(r):null} onDelete={r.syncStatus?null:()=>removeRecord(r.id)}/>)}</div>}</section>}
    </div>
    {manage&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setManage(false)}}><div className="modal"><button className="close" onClick={()=>setManage(false)}>×</button><h2>Welder IDs</h2><p>Add, rename, or remove IDs shown in the form dropdown.</p><div className="add"><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="e.g. BK7963"/><button onClick={saveWelder}>{editing?"Save":"+ Add"}</button></div><div className="welder-list">{!welders.length?<p>No welder IDs yet.</p>:welders.map(w=><div key={w.id}><strong>{w.code}</strong><button onClick={()=>{setEditing(w.id);setCode(w.code)}}>✎</button><button onClick={()=>removeWelder(w.id)}>⌫</button></div>)}</div></div></div>}
    {finalRecord&&<div className="overlay"><form className="modal final-modal" onSubmit={saveFinal}><button type="button" className="close" onClick={closeFinal}>×</button><h2>Add final inspection</h2><p>Line <b>{finalRecord.lineNo}</b> · Weld <b>{finalRecord.weldNo}</b></p><div className="locked"><Meta label="Line number" value={finalRecord.lineNo}/><Meta label="Weld number" value={finalRecord.weldNo}/><Meta label="Root welder" value={finalRecord.welderId}/><Meta label="Root VT date" value={finalRecord.rootVtDate}/></div><label><span>Final welder ID</span><select value={finalWelderId} onChange={e=>setFinalWelderId(e.target.value)}><option value="UNK">UNK — Unknown</option>{welders.map(w=><option key={w.id} value={w.code}>{w.code}</option>)}</select></label><Field label="Final weld date" name="finalDate" type="date"/><label className="photo final-photo">{finalPreview?<img src={finalPreview} alt="Selected final inspection"/>:<><span className="camera">▣</span><strong>Take final photo</strong></>}<input type="file" accept="image/*" capture="environment" onChange={e=>pick(e.target.files?.[0],setFinalPhoto,setFinalPreview,finalPreview)}/>{finalPreview&&<em>Tap to retake</em>}</label><Field label="Final VT date" name="finalVtDate" type="date" defaultValue={today()}/><button className="primary modal-save" disabled={saving}>{saving?"Saving…":"✓ Complete weld record"}</button></form></div>}
  </main>
}
function Field({label,...props}){return <label><span>{label}</span><input {...props}/></label>}
function Meta({label,value}){return <div><dt>{label}</dt><dd className={value==="UNK"?"unknown":""}>{value}</dd></div>}
function WeldCard({record,onFinal,onDelete}){return <article className={record.status==="COMPLETE"?"complete":""}><div className="photo-pair"><figure>{record.rootPhotoUrl?<img src={record.rootPhotoUrl} alt={`Root weld ${record.weldNo}`}/>:<div className="photo-placeholder">N/A</div>}<figcaption>ROOT</figcaption></figure>{record.finalPhotoUrl&&<figure><img src={record.finalPhotoUrl} alt={`Final weld ${record.weldNo}`}/><figcaption>FINAL</figcaption></figure>}</div><div><span className="badge">{record.syncStatus?record.syncStatus==="failed"?"SYNC FAILED":"PENDING SYNC":record.status==="COMPLETE"?"COMPLETE":"AWAITING FINAL"}</span><h3>Weld {record.weldNo}</h3><dl><Meta label="Line" value={record.lineNo}/><Meta label="Root welder" value={record.welderId}/><Meta label="Root date" value={record.rootDate}/><Meta label="Root VT" value={record.rootVtDate}/><Meta label="Final welder" value={record.finalWelderId||"UNK"}/><Meta label="Final date" value={record.finalDate||"UNK"}/><Meta label="Final VT" value={record.finalVtDate}/><Meta label="Rework" value={record.rework}/></dl>{onFinal&&<button className="add-final" onClick={onFinal}>+ Add final inspection</button>}</div>{onDelete&&<button className="trash" onClick={onDelete}>⌫</button>}</article>}
