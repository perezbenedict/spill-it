"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {ArrowDownToLine,Copy,RefreshCw,Sparkles} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Dialog from '@/components/ui/Dialog';
import {discussionAvailability,discussionSource,POST_LAYOUTS,POST_FONTS,POST_SIZES,POST_THEMES,postFilename,socialCaption} from '@/lib/social-posts';
import {drawSocialPost,preparePostAssets,rawQrCanvas,socialPostBlob} from '@/lib/social-post-canvas';
import {ELEMENT_COLORS,ELEMENT_TEMPLATES,ELEMENT_TYPES,applyTemplate,createShapeElement,createTextElement,elementColor,historyCommit,historyInitial,historyRedo,historyUndo,hitTest,moveElement,resizeElement,resizeHandleAt,rotateElement,snapMove} from '@/lib/post-elements';
import './post-studio.css';

const standaloneSource={id:'standalone',category:'standalone',content:''};
const categoryLabel={standalone:'Standalone post',discussion:'Discussion topic',question:'Question',opinion:'Opinion',challenge:'Shake the table',twocents:'Two cents'};
export default function PostStudio({sessions,session,initialItems,initialTotal,initialSource,initialError,hasMoreSessions,siteUrl}){
 const router=useRouter(),canvas=useRef(null),drawnOptions=useRef(null),alive=useRef(true),exportLock=useRef(false),firstRead=useRef(true);
 const [source,setSource]=useState(initialSource || (!session?standaloneSource:null)),[items,setItems]=useState(initialItems),[total,setTotal]=useState(initialTotal),[query,setQuery]=useState(''),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0);
 const [loading,setLoading]=useState(false),[listError,setListError]=useState(initialError),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false);
 const [size,setSize]=useState('portrait'),[theme,setTheme]=useState('aurora'),[title,setTitle]=useState(''),[showTitle,setShowTitle]=useState(!session),[topic,setTopic]=useState(session?.topic || session?.title || ''),[showTopic,setShowTopic]=useState(Boolean(session)),[showLogo,setShowLogo]=useState(true),[showEmblem,setShowEmblem]=useState(true),[showLink,setShowLink]=useState(false),[captionOpen,setCaptionOpen]=useState(false);
 const [preview,setPreview]=useState(null),[renderError,setRenderError]=useState('');
 const [expanded,setExpanded]=useState('');
 const [font,setFont]=useState('fredoka'),[showName,setShowName]=useState(false),[showCategory,setShowCategory]=useState(Boolean(session)),[useQuotes,setUseQuotes]=useState(false),[useGrain,setUseGrain]=useState(false),[grainAmount,setGrainAmount]=useState(.22),[commentText,setCommentText]=useState(initialSource?.content || '');
 const [layout,setLayout]=useState(session?'post':'standalone'),[fontSize,setFontSize]=useState(null),[showQR,setShowQR]=useState(false),[showCommunityName,setShowCommunityName]=useState(false),[showGNWY,setShowGNWY]=useState(false),[extraTexts,setExtraTexts]=useState([{enabled:false,text:''},{enabled:false,text:''},{enabled:false,text:''}]),[eventWhen,setEventWhen]=useState(''),[eventWhere,setEventWhere]=useState(''),[availability,setAvailability]=useState(session);
 const drafts=useRef({});
 const [code,setCode]=useState(session?.code || '');
 const [elementHistory,setElementHistory]=useState(()=>historyInitial([])),[selectedElementId,setSelectedElementId]=useState(''),[snapEnabled,setSnapEnabled]=useState(true),[overlayGuides,setOverlayGuides]=useState([]),[overlayTick,setOverlayTick]=useState(0);
 const overlayCanvas=useRef(null),interaction=useRef(null);
 const elements=elementHistory.present,selectedElement=elements.find(item=>item.id===selectedElementId) || null,themeConfig=POST_THEMES.find(item=>item.id===theme) || POST_THEMES[0];
 const discussionLink=session?`${siteUrl.replace(/\/$/,'')}/join/${code}`:'';
 const options=useMemo(()=>({source,size,theme,title,showTitle,topic,showTopic,showLogo,showEmblem,showLink,discussionLink,font,showName,showCategory,useQuotes,useGrain,grainAmount,commentText,layout,fontSize,showQR,showCommunityName,showGNWY,extraTexts:layout==='standalone'?extraTexts:[],eventWhen,eventWhere,elements}),[source,size,theme,title,showTitle,topic,showTopic,showLogo,showEmblem,showLink,discussionLink,font,showName,showCategory,useQuotes,useGrain,grainAmount,commentText,layout,fontSize,showQR,showCommunityName,showGNWY,extraTexts,eventWhen,eventWhere,elements]);
 const caption=socialCaption(options),pages=Math.max(1,Math.ceil(total/25));
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!session)return;
  if(firstRead.current){firstRead.current=false;return;}
  let disposed=false;const controller=new AbortController();setLoading(true);
  const timer=setTimeout(async()=>{
   const timeout=setTimeout(()=>controller.abort(),12000);
   try{
    const response=await fetch(`/api/admin/social-posts?${new URLSearchParams({session:session.id,page:String(page),q:query})}`,{cache:'no-store',signal:controller.signal}),body=await response.json();
    if(!response.ok)throw Error(body.error || 'Could not load contributions.');
    if(!disposed){setItems(body.items);setTotal(body.total);setListError('');}
   }catch(failure){if(!disposed)setListError(failure.name==='AbortError'?'The request timed out. Try again.':failure.message);}
   finally{clearTimeout(timeout);if(!disposed)setLoading(false);}
  },180);
  return()=>{disposed=true;clearTimeout(timer);controller.abort();};
 },[session,page,query,refresh]);
 useEffect(()=>{
  let disposed=false;drawnOptions.current=null;setPreview(null);setRenderError('');setStatus('');
  const timer=setTimeout(async()=>{
   try{const assets=await preparePostAssets(options.showEmblem,options.font,options.showQR?options.discussionLink:'');if(disposed || !canvas.current)return;const result=drawSocialPost(canvas.current,options,assets);drawnOptions.current=options;setPreview(result);}
   catch(failure){if(!disposed)setRenderError(failure.message || 'Could not prepare the preview.');}
  },100);
  return()=>{disposed=true;clearTimeout(timer);};
 },[options]);
 useEffect(()=>{
  const node=overlayCanvas.current;if(!node||typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(()=>setOverlayTick(value=>value+1));observer.observe(node);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  const node=overlayCanvas.current;if(!node)return;
  const rect=node.getBoundingClientRect(),ratio=window.devicePixelRatio || 1;
  const width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
  if(node.width!==width)node.width=width;if(node.height!==height)node.height=height;
  const ctx=node.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,rect.width,rect.height);
  const accent=themeConfig.accent;
  for(const guide of overlayGuides){ctx.save();ctx.strokeStyle=accent;ctx.globalAlpha=.7;ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();if(guide.axis==='x'){ctx.moveTo(guide.position*rect.width,0);ctx.lineTo(guide.position*rect.width,rect.height);}else{ctx.moveTo(0,guide.position*rect.height);ctx.lineTo(rect.width,guide.position*rect.height);}ctx.stroke();ctx.restore();}
  if(selectedElement){
   const element=selectedElement,cx=(element.x+element.w/2)*rect.width,cy=(element.y+element.h/2)*rect.height;
   ctx.save();ctx.translate(cx,cy);ctx.rotate(element.rotation*Math.PI/180);ctx.strokeStyle=accent;ctx.lineWidth=1.5;ctx.strokeRect(-element.w*rect.width/2,-element.h*rect.height/2,element.w*rect.width,element.h*rect.height);
   ctx.fillStyle=accent;
   for(const [hx,hy] of [[-1,-1],[1,-1],[1,1],[-1,1]])ctx.fillRect(hx*element.w*rect.width/2-4.5,hy*element.h*rect.height/2-4.5,9,9);
   ctx.beginPath();ctx.moveTo(0,-element.h*rect.height/2);ctx.lineTo(0,-element.h*rect.height/2-22);ctx.stroke();
   ctx.beginPath();ctx.arc(0,-element.h*rect.height/2-26,6,0,Math.PI*2);ctx.fill();ctx.restore();
  }
 },[elements,selectedElement,overlayGuides,themeConfig,overlayTick]);
 useEffect(()=>{
  function onKey(event){
   const tag=event.target?.tagName;
   if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;
   if((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='z'){event.preventDefault();setElementHistory(history=>event.shiftKey?historyRedo(history):historyUndo(history));return;}
   if(!selectedElementId)return;
   if(event.key==='Delete' || event.key==='Backspace'){event.preventDefault();setElementHistory(history=>historyCommit(history,history.present.filter(item=>item.id!==selectedElementId)));setSelectedElementId('');return;}
   const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},direction=directions[event.key];
   if(!direction)return;
   event.preventDefault();
   const step=event.shiftKey?0.02:0.004;
   setElementHistory(history=>historyCommit(history,history.present.map(item=>item.id===selectedElementId && !item.locked?moveElement(item,direction[0]*step,direction[1]*step):item),`nudge-${selectedElementId}`));
  }
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[selectedElementId]);
 function choose(next){setSource(next);setCommentText(next?.content || '');setBlocked(false);setError('');setStatus('');}
 function changeLayout(next){
  drafts.current[layout]={source,commentText,title,showTitle,showTopic,showLink,showCategory,showQR,eventWhen,eventWhere};
  const saved=drafts.current[next],invitation=next==='invitation' || next==='qr';
  setLayout(next);setBlocked(false);setError('');setShowName(false);setUseQuotes(false);setFontSize(null);
  setSource(saved?.source || (next==='standalone'?standaloneSource:session?discussionSource(session):null));setCommentText(saved?.commentText ?? (next==='standalone'?'':session?.topic || session?.title || ''));
  setTitle(saved?.title ?? (invitation?'Join the conversation':''));setShowTitle(saved?.showTitle ?? (next==='standalone' || invitation));setShowTopic(saved?.showTopic ?? (next==='post'));setShowLink(saved?.showLink ?? invitation);setShowCategory(saved?.showCategory ?? (next==='post'));setShowQR(saved?.showQR ?? invitation);setEventWhen(saved?.eventWhen || '');setEventWhere(saved?.eventWhere || '');
 }
 function resizeFont(delta){setFontSize(value=>Math.max(24,Math.min(180,(value ?? preview?.fontSize ?? 80)+delta)));}
 function editElements(update,token=null){setElementHistory(history=>historyCommit(history,typeof update==='function'?update(history.present):update,token));}
 function updateElement(id,patch,token=null){editElements(list=>list.map(item=>item.id===id?{...item,...patch}:item),token);}
 function removeElement(id){editElements(list=>list.filter(item=>item.id!==id));setSelectedElementId(current=>current===id?'':current);}
 function duplicateElement(id){editElements(list=>{const original=list.find(item=>item.id===id);if(!original)return list;const copy={...original,id:`${original.type}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,x:Math.min(.94,original.x+.03),y:Math.min(.94,original.y+.03)},index=list.indexOf(original);return [...list.slice(0,index+1),copy,...list.slice(index+1)];});}
 function reorderElement(id,move){editElements(list=>{const index=list.findIndex(item=>item.id===id);if(index<0)return list;const target=move==='front'?list.length-1:move==='back'?0:Math.max(0,Math.min(list.length-1,index+move));if(target===index)return list;const next=[...list],[item]=next.splice(index,1);next.splice(target,0,item);return next;});}
 function addElement(type){const next=type==='text'?createTextElement(themeConfig):createShapeElement(type,themeConfig);if(elements.length>=200)return;editElements(list=>[...list,next]);setSelectedElementId(next.id);}
 function addTemplate(id){const built=applyTemplate(id,themeConfig,elements);if(built===elements)return;editElements(built);const added=built[built.length-1];if(added)setSelectedElementId(added.id);}
 function overlayPoint(event){const rect=overlayCanvas.current.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height,width:rect.width,height:rect.height};}
 function overRotateHandle(element,point){const cx=(element.x+element.w/2)*point.width,cy=(element.y+element.h/2)*point.height,radians=element.rotation*Math.PI/180,distance=element.h*point.height/2+26;return Math.hypot(cx+Math.sin(radians)*distance-point.x*point.width,cy-Math.cos(radians)*distance-point.y*point.height)<=16;}
 function beginElementDrag(event){
  if(event.button!==0 || !overlayCanvas.current)return;
  const point=overlayPoint(event),target=hitTest(elements,point,{width:point.width,height:point.height});
  if(!target){setSelectedElementId('');return;}
  setSelectedElementId(target.id);
  if(target.locked)return;
  event.preventDefault();event.currentTarget.setPointerCapture?.(event.pointerId);
  const handle=overRotateHandle(target,point)?'rotate':resizeHandleAt(target,point,{width:point.width,height:point.height});
  interaction.current={mode:handle==='rotate'?'rotate':handle?'resize':'move',handle,element:target,start:point,started:false};
 }
 function dragElement(event){
  const active=interaction.current;if(!active)return;
  const point=overlayPoint(event);let next;
  if(active.mode==='rotate'){next=rotateElement(active.element,point,{shiftKey:event.shiftKey});setOverlayGuides([]);}
  else if(active.mode==='resize'){next=resizeElement(active.element,active.handle,point);setOverlayGuides([]);}
  else{let dx=point.x-active.start.x,dy=point.y-active.start.y,guides=[];if(snapEnabled){const snapped=snapMove(active.element,dx,dy);dx=snapped.dx;dy=snapped.dy;guides=snapped.guides;}next=moveElement(active.element,dx,dy);setOverlayGuides(guides);}
  setElementHistory(history=>{
   if(!active.started){active.started=true;return historyCommit(history,history.present.map(item=>item.id===next.id?next:item),`drag-${next.id}`);}
   return {...history,present:history.present.map(item=>item.id===next.id?next:item)};
  });
 }
 function endElementDrag(event){
  if(!interaction.current)return;
  interaction.current=null;setOverlayGuides([]);
  try{event.currentTarget.releasePointerCapture?.(event.pointerId);}catch{/* pointer capture is best effort */}
 }
 async function validateSelected(snapshot){
  if(!session || (snapshot.layout==='standalone' && !snapshot.showLink && !snapshot.showQR && !snapshot.showTopic))return;
  const standalone=snapshot.layout==='standalone';
  const response=await fetch(`/api/admin/social-posts?${new URLSearchParams({session:session.id,post:standalone?'discussion':snapshot.source.id})}`,{cache:'no-store',signal:AbortSignal.timeout(12000)}),body=await response.json();
  if(!response.ok){if([404,409].includes(response.status))setBlocked(true);throw Error(body.error || 'Could not check this post. Try again.');}
  setAvailability(previous=>({...previous,status:body.status,closesAt:body.closesAt}));
  if(!standalone && !snapshot.qrOnlyExport && (body.source.content!==snapshot.source.content || body.source.category!==snapshot.source.category)){setSource(body.source);setCommentText(previous=>previous===snapshot.source.content?body.source.content:previous);if(body.source.category==='discussion')setTopic(previous=>previous===snapshot.source.content?body.source.content:previous);throw Error('This post has changed. Review the updated preview before downloading or copying.');}
  if(snapshot.showName && body.source.name!==snapshot.source.name){setSource(body.source);throw Error('The contributor name has changed. Review the updated attribution before downloading or copying.');}
  if(body.code && body.code!==code){setCode(body.code);if(snapshot.showLink || snapshot.showQR)throw Error('The discussion link has changed. Review the updated preview before downloading or copying.');}
 }
 async function exportImage(){
  if(exportLock.current || !source || !commentText.trim() || blocked)return;exportLock.current=true;setBusy(true);setError('');setStatus('');const snapshot=options;
  try{
   await validateSelected(snapshot);if(!alive.current)return;
   if(drawnOptions.current!==snapshot || !canvas.current || !preview)throw Error('The preview is still updating. Try the download again.');
   const output=canvas.current,result=preview;
   if(!result.fits)throw Error('The full text does not fit this size. Reduce the main text size, choose Vertical, or turn off optional text.');
   const blob=await socialPostBlob(output);if(!alive.current)return;
   const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=postFilename(snapshot.layout==='invitation' || snapshot.layout==='qr'?{id:snapshot.layout,category:snapshot.layout}:snapshot.source,snapshot.size);document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
   setStatus(`Image downloaded · ${result.width} × ${result.height} PNG`);
  }catch(failure){if(alive.current)setError(failure.name==='TimeoutError'?'Could not check this post. Please try again.':failure.message);}
  finally{exportLock.current=false;if(alive.current)setBusy(false);}
 }
 async function copyCaption(){
  if(exportLock.current || !source || !commentText.trim() || blocked)return;exportLock.current=true;setBusy(true);setError('');setStatus('');
  try{await validateSelected(options);try{await navigator.clipboard.writeText(caption);setStatus('Caption copied.');}catch{setCaptionOpen(true);setStatus('Select and copy the caption below.');}}
  catch(failure){if(alive.current)setError(failure.message || 'Could not check this post. Try again.');}
  finally{exportLock.current=false;if(alive.current)setBusy(false);}
 }
 async function exportQr(){
  if(exportLock.current || !session)return;exportLock.current=true;setBusy(true);setError('');
  try{await validateSelected({...options,source:discussionSource(session),layout:'qr',showQR:true,qrOnlyExport:true});const output=await rawQrCanvas(discussionLink),blob=await socialPostBlob(output);const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`spill-it-qr-${code}.png`;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);setStatus('QR downloaded · 1024 × 1024 PNG');}catch(failure){if(alive.current)setError(failure.message);}finally{exportLock.current=false;if(alive.current)setBusy(false);}
 }
 return <div className="post-studio space-y-7">
  <header className="post-studio-heading"><div><p className="text-xs font-semibold uppercase tracking-[.22em] text-gold-light">SPILL IT · POST STUDIO</p><h1 className="mt-3 font-display text-4xl sm:text-5xl">A voice worth sharing.</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">Create a standalone post, discussion invitation or contribution post for Instagram, TikTok or Facebook. Make it yours, then download it when you’re ready.</p></div><Sparkles className="hidden h-9 w-9 text-gold-light sm:block" aria-hidden="true"/></header>
  <div className="post-studio-grid">
   <div className="min-w-0 space-y-5">
    <section className="post-studio-panel" aria-label="Post source">
     <p className="post-studio-step">01 · CHOOSE THE VOICE</p><h2 className="mt-2 font-display text-2xl">What are we posting?</h2>
     <label className="mt-4 block text-sm">Post layout<select aria-label="Post layout" className="post-studio-select mt-2" disabled={busy} value={layout} onChange={event=>changeLayout(event.target.value)}>{POST_LAYOUTS.map(item=><option key={item.id} value={item.id} disabled={!session && item.id!=='standalone'}>{item.label}</option>)}</select></label>
     {!session && <p className="mt-3 text-sm text-muted">Write a standalone post here. <Link href="/admin/sessions" className="underline">Create a discussion</Link> when you want to add a discussion link or QR code.</p>}
     {session && <label className="mt-4 block text-sm">Discussion<select aria-label="Discussion for social post" className="post-studio-select mt-2" disabled={busy} value={session?.id || ''} onChange={event=>router.push(`/admin/posts?session=${event.target.value}`)}>{sessions.map(item=><option value={item.id} key={item.id}>{item.title} · {item.status}</option>)}</select></label>}
     {hasMoreSessions && <p className="mt-2 text-xs text-muted">Showing recent discussions. Open an older discussion from <Link href="/admin/sessions" className="underline">Sessions</Link> to create its post.</p>}
     {layout==='post' && session && <fieldset disabled={busy} className="mt-4 space-y-3"><legend className="sr-only">Choose post content</legend>
      <label className="post-source-card"><input type="radio" name="social-source" value="discussion" checked={source?.id==='discussion'} onChange={()=>choose(discussionSource(session))}/><span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-[.14em] text-gold-light">Discussion topic</span><span className="mt-1 block text-sm leading-relaxed">{session.topic || session.title}</span></span></label>
      <label className="block text-sm">Find a contribution<Input aria-label="Find a contribution" className="mt-2" maxLength={100} value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}} placeholder="Search approved posts…"/></label>
      <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted">Approved, visible contributions · {total}</p><Button variant="ghost" size="sm" disabled={loading} onClick={()=>setRefresh(value=>value+1)} aria-label="Refresh contributions"><RefreshCw size={15} aria-hidden="true"/></Button></div>
      {listError && <p role="alert" className="text-sm text-crimson-bright">{listError}</p>}
      <div className="post-source-list" aria-busy={loading}>{items.map(item=><label className="post-source-card" key={item.id}><input type="radio" name="social-source" aria-label={`Use contribution: ${item.content.slice(0,90)}`} value={item.id} checked={source?.id===item.id} onChange={()=>choose(item)}/><span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-[.14em] text-gold-light">{categoryLabel[item.category]}{item.isPinned && <span className="ml-3 rounded-full border border-current px-2 py-0.5">Pinned</span>}</span><span className="mt-1 line-clamp-3 block whitespace-pre-wrap break-words text-sm leading-relaxed">{item.content}</span></span></label>)}</div>
      {!items.length && !loading && <p className="py-3 text-sm text-muted">{query?'No approved posts match this search.':'No approved contributions yet. You can use the discussion topic above.'}</p>}
      {pages>1 && <div className="flex items-center justify-between gap-2"><Button variant="ghost" size="sm" disabled={page===1 || loading} onClick={()=>setPage(value=>value-1)}>Previous posts</Button><span className="text-xs text-muted">{page} / {pages}</span><Button variant="ghost" size="sm" disabled={page>=pages || loading} onClick={()=>setPage(value=>value+1)}>Next posts</Button></div>}
     </fieldset>}
     {source && <fieldset disabled={busy} className="mt-5 space-y-3 border-t border-white/10 pt-5"><legend className="sr-only">Edit this post copy</legend><label className="block text-sm">Post text<textarea aria-label="Post text" className="post-studio-select post-copy-field mt-2" rows={6} maxLength={2000} value={commentText} onChange={event=>setCommentText(event.target.value)}/></label><p className="text-xs leading-relaxed text-muted">{layout==='standalone'?'Write your own post. Each extra text block below can be included independently.':'Edits apply to this image and caption only. The original contribution stays unchanged.'}</p><div className="flex items-center justify-between gap-2"><span className="text-xs text-muted">{commentText.length} / 2,000</span>{layout!=='standalone' && <Button variant="ghost" size="sm" disabled={commentText===source.content} onClick={()=>setCommentText(source.content)}>Reset to original</Button>}</div>{layout!=='standalone' && <details><summary className="cursor-pointer text-xs text-muted">View original wording</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">{source.content}</p></details>}</fieldset>}
     {layout==='standalone' && <fieldset disabled={busy} className="mt-5 space-y-4"><legend className="text-sm font-semibold">Optional text blocks</legend>{extraTexts.map((item,index)=><div key={index}><label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={item.enabled} onChange={event=>setExtraTexts(rows=>rows.map((row,i)=>i===index?{...row,enabled:event.target.checked}:row))}/>Include extra text {index+1}</label>{item.enabled && <textarea aria-label={`Extra text ${index+1}`} className="post-studio-select" rows={2} maxLength={240} placeholder="A subtitle, introduction, note or call to action…" value={item.text} onChange={event=>setExtraTexts(rows=>rows.map((row,i)=>i===index?{...row,text:event.target.value}:row))}/>}</div>)}</fieldset>}
     {(layout==='invitation' || layout==='qr') && <fieldset disabled={busy} className="mt-5 space-y-4"><legend className="text-sm font-semibold">Invitation details · optional</legend><Input aria-label="Event date and time" placeholder="Sunday · 10:00 AM" maxLength={100} value={eventWhen} onChange={event=>setEventWhen(event.target.value)}/><Input aria-label="Event venue" placeholder="Venue or online details" maxLength={150} value={eventWhere} onChange={event=>setEventWhere(event.target.value)}/><p className="text-xs text-muted">These details appear on this post only.</p></fieldset>}
     {(layout==='invitation' || layout==='qr' || showLink || showQR) && <p className="mt-4 rounded-control border border-violet-400/25 p-3 text-sm text-muted" role="note">{discussionAvailability(availability)}</p>}
    </section>
    <section className="post-studio-panel" aria-label="Post design">
     <p className="post-studio-step">02 · SET THE MOOD</p><h2 className="mt-2 font-display text-2xl">Your post, your way.</h2>
     <fieldset disabled={busy} className="mt-5 space-y-5"><legend className="sr-only">Post appearance</legend>
      <div className="post-theme-grid">{POST_THEMES.map(item=><button type="button" key={item.id} aria-pressed={theme===item.id} aria-label={`Use ${item.label} background`} className="post-theme-choice" onClick={()=>{setTheme(item.id);if(item.id==='grain-purple')setUseGrain(true);}}><span aria-hidden="true" style={{background:`radial-gradient(ellipse at 80% 10%,${item.glow},transparent 75%),${item.background}`,borderColor:item.accent+'66'}}/><span>{item.label}</span></button>)}</div>
      <label className="block text-sm">Image size<select aria-label="Image size" className="post-studio-select mt-2" value={size} onChange={event=>setSize(event.target.value)}>{POST_SIZES.map(item=><option value={item.id} key={item.id}>{item.label} · {item.width} × {item.height}</option>)}</select></label>
      <label className="block text-sm">Comment font<select aria-label="Comment font" className="post-studio-select mt-2" value={font} onChange={event=>setFont(event.target.value)}>{POST_FONTS.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select><span className="mt-2 block text-xs text-muted">Changes the main post text. Headings and branding keep their original fonts.</span></label>
      <fieldset className="space-y-3"><legend className="text-sm">Main text size · {fontSize===null?`Auto fit${preview?` (${preview.fontSize}px)`:''}`:`${fontSize}px`}</legend><div className="flex flex-wrap items-center gap-2"><Button variant="secondary" size="sm" aria-label="Decrease main text size" onClick={()=>resizeFont(-4)}>−</Button><input aria-label="Main text size" type="range" min={24} max={180} step={2} value={fontSize ?? preview?.fontSize ?? 80} onChange={event=>setFontSize(Number(event.target.value))} className="min-w-0 flex-1 accent-violet-400"/><Button variant="secondary" size="sm" aria-label="Increase main text size" onClick={()=>resizeFont(4)}>+</Button><Button variant="ghost" size="sm" onClick={()=>setFontSize(null)}>Auto fit</Button></div><p className="text-xs text-muted">Manual sizing keeps your chosen size. Reduce it if the text does not fit.</p></fieldset>
      <div className="post-toggle-grid">{[[showEmblem,setShowEmblem,'Include emblem'],[showLogo,setShowLogo,'Include Spill It logo'],[showTitle,setShowTitle,'Include title'],[showTopic,setShowTopic,'Include discussion topic',!session],[showLink,setShowLink,'Include discussion link',!session],[showQR,setShowQR,'Include QR code',!session || layout==='qr'],[showCommunityName,setShowCommunityName,'Include Grace Nation Wealthy Youths'],[showGNWY,setShowGNWY,'Include GNWY'],[showName,setShowName,'Include contributor name',!source?.name],[useQuotes,setUseQuotes,'Use quotation marks'],[showCategory,setShowCategory,'Include post type',layout!=='post'],[useGrain,setUseGrain,'Add grain texture']].map(([checked,set,label,unavailable])=><label key={label} className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-violet-400" checked={checked} disabled={Boolean(unavailable)} onChange={event=>set(event.target.checked)}/>{label}</label>)}</div>
      {showTitle && <label className="block text-sm">Post title<Input aria-label="Post title" className="mt-2" value={title} maxLength={100} placeholder="Top comments, A question worth asking…" onChange={event=>setTitle(event.target.value)}/><span className="mt-2 block text-xs text-muted">Write any title you like. There is no fixed “Top 5” heading.</span></label>}
      {showName && source?.name && <p className="text-xs text-muted">Contributor name: {source.name}. This is the nickname attached to the contribution.</p>}
      {layout==='post' && !source?.name && <p className="text-xs text-muted">Choose a contribution to include its contributor’s nickname.</p>}
      {useGrain && <label className="block text-sm">Grain amount · {Math.round(grainAmount*100)}%<input aria-label="Grain amount" type="range" className="mt-3 block w-full accent-violet-400" min={5} max={40} value={Math.round(grainAmount*100)} onChange={event=>setGrainAmount(Number(event.target.value)/100)}/></label>}
      {showTopic && <label className="block text-sm">Topic text<Input aria-label="Topic text" className="mt-2" value={topic} maxLength={200} onChange={event=>setTopic(event.target.value)}/><span className="mt-2 block text-xs text-muted">The topic appears once if it is already the main post.</span></label>}
      {showLink && <p className="break-all text-xs leading-relaxed text-muted">The link appears on the image and in the caption:<br/>{discussionLink}</p>}
     </fieldset>
    </section>
    <section className="post-studio-panel" aria-label="Layer editor">
     <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="post-studio-step">03 · LAYER IT</p><h2 className="mt-2 font-display text-2xl">Add your own layer.</h2></div><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-violet-400" checked={snapEnabled} onChange={event=>setSnapEnabled(event.target.checked)}/>Snap to guides</label></div>
     <p className="mt-2 text-sm leading-relaxed text-muted">Put text and shapes on the image itself. Drag to move, the corner handles resize, and the round handle on top rotates. Hold Shift while rotating to snap to 15°.</p>
     <div className="mt-4 flex flex-wrap gap-2">{ELEMENT_TYPES.map(item=><Button key={item.id} variant="secondary" size="sm" disabled={busy || elements.length>=200} onClick={()=>addElement(item.id)}>{item.label}</Button>)}<Button variant="ghost" size="sm" disabled={busy || !elements.length} onClick={()=>{editElements([]);setSelectedElementId('');}}>Clear layers</Button></div>
     <label className="mt-3 block text-sm">Start from a template<select aria-label="Layer template" className="post-studio-select mt-2" value="" disabled={busy || elements.length>=200} onChange={event=>{if(event.target.value)addTemplate(event.target.value);}}><option value="">Choose a template…</option>{ELEMENT_TEMPLATES.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
     <div className="post-element-layers" aria-label="Layers">
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-[.14em] text-gold-light">Layers · top first</p><span className="text-xs text-muted">{elements.length} / 200</span></div>
      {!elements.length && <p className="py-2 text-sm text-muted">Nothing on the image yet. Add text or a shape, then drag it into place.</p>}
      {[...elements].reverse().map(item=><div key={item.id} className={`post-element-row${item.id===selectedElementId?' is-selected':''}`}><button type="button" className="post-element-name" aria-pressed={item.id===selectedElementId} onClick={()=>setSelectedElementId(item.id)}>{item.type==='text'?(item.text.trim().slice(0,48) || 'Empty text'):ELEMENT_TYPES.find(type=>type.id===item.type)?.label || item.type}</button><div className="post-element-row-actions"><button type="button" aria-label={item.visible?'Hide layer':'Show layer'} aria-pressed={!item.visible} onClick={()=>updateElement(item.id,{visible:!item.visible})}>{item.visible?'◉':'○'}</button><button type="button" aria-label="Move layer up" disabled={elements.indexOf(item)===elements.length-1} onClick={()=>reorderElement(item.id,1)}>↑</button><button type="button" aria-label="Move layer down" disabled={elements.indexOf(item)===0} onClick={()=>reorderElement(item.id,-1)}>↓</button></div></div>)}
     </div>
     {selectedElement && <fieldset disabled={busy} className="post-element-inspector"><legend className="text-sm font-semibold">Selected layer</legend>
      {selectedElement.type==='text' && <><label className="block text-sm">Text<textarea aria-label="Layer text" className="post-studio-select mt-2" rows={3} maxLength={300} value={selectedElement.text} onChange={event=>updateElement(selectedElement.id,{text:event.target.value},`text-${selectedElement.id}`)}/></label><label className="block text-sm">Text size · {Math.round(selectedElement.fontSize*1000)/10}% of width<input aria-label="Layer text size" type="range" className="mt-3 block w-full accent-violet-400" min={.02} max={.14} step={.002} value={selectedElement.fontSize} onChange={event=>updateElement(selectedElement.id,{fontSize:Number(event.target.value)},`size-${selectedElement.id}`)}/></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm">Weight<select aria-label="Layer text weight" className="post-studio-select mt-2" value={selectedElement.weight} onChange={event=>updateElement(selectedElement.id,{weight:Number(event.target.value)})}>{[400,500,600,700,800].map(weight=><option key={weight} value={weight}>{weight}</option>)}</select></label><label className="block text-sm">Font<select aria-label="Layer font role" className="post-studio-select mt-2" value={selectedElement.role} onChange={event=>updateElement(selectedElement.id,{role:event.target.value})}><option value="display">Display</option><option value="body">Body</option><option value="comment">Comment</option></select></label></div><div className="flex flex-wrap gap-2" role="group" aria-label="Layer text alignment">{[['left','Left'],['center','Center'],['right','Right']].map(([value,label])=><Button key={value} variant={selectedElement.align===value?'secondary':'ghost'} size="sm" aria-pressed={selectedElement.align===value} onClick={()=>updateElement(selectedElement.id,{align:value})}>{label}</Button>)}</div></>}
      {selectedElement.type!=='text' && <><label className="block text-sm">Shape width<input aria-label="Layer shape width" type="range" className="mt-3 block w-full accent-violet-400" min={.01} max={1} step={.01} value={selectedElement.w} onChange={event=>updateElement(selectedElement.id,{w:Number(event.target.value)},`width-${selectedElement.id}`)}/></label>{selectedElement.type==='rect' && <label className="block text-sm">Corner radius · {Math.round(selectedElement.radius*1000)/10}%<input aria-label="Layer corner radius" type="range" className="mt-3 block w-full accent-violet-400" min={0} max={.2} step={.005} value={selectedElement.radius} onChange={event=>updateElement(selectedElement.id,{radius:Number(event.target.value)},`radius-${selectedElement.id}`)}/></label>}{selectedElement.type==='line' && <label className="block text-sm">Line weight<input aria-label="Layer line weight" type="range" className="mt-3 block w-full accent-violet-400" min={1} max={24} step={1} value={selectedElement.strokeWidth} onChange={event=>updateElement(selectedElement.id,{strokeWidth:Number(event.target.value)},`stroke-${selectedElement.id}`)}/></label>}</>}
      <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-gold-light">{selectedElement.type==='text'?'Text colour':'Shape colour'}</p><div className="mt-2 flex flex-wrap gap-2">{ELEMENT_COLORS.map(item=><button type="button" key={item.id} aria-label={`Set colour to ${item.label}`} aria-pressed={(selectedElement.type==='text'?selectedElement.color:selectedElement.fill)===item.id} className="post-element-swatch" style={{background:elementColor(item.id,themeConfig)}} onClick={()=>updateElement(selectedElement.id,selectedElement.type==='text'?{color:item.id}:{fill:item.id,stroke:item.id})}/>)}</div></div>
      <label className="block text-sm">Opacity · {Math.round(selectedElement.opacity*100)}%<input aria-label="Layer opacity" type="range" className="mt-3 block w-full accent-violet-400" min={.1} max={1} step={.05} value={selectedElement.opacity} onChange={event=>updateElement(selectedElement.id,{opacity:Number(event.target.value)},`opacity-${selectedElement.id}`)}/></label>
      <label className="block text-sm">Rotation · {selectedElement.rotation}°<input aria-label="Layer rotation" type="range" className="mt-3 block w-full accent-violet-400" min={-180} max={180} step={1} value={selectedElement.rotation>180?selectedElement.rotation-360:selectedElement.rotation} onChange={event=>updateElement(selectedElement.id,{rotation:Number(event.target.value)},`rotation-${selectedElement.id}`)}/></label>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={()=>duplicateElement(selectedElement.id)}>Duplicate</Button><Button variant="ghost" size="sm" aria-pressed={selectedElement.locked} onClick={()=>updateElement(selectedElement.id,{locked:!selectedElement.locked})}>{selectedElement.locked?'Unlock':'Lock'}</Button><Button variant="ghost" size="sm" disabled={elements.indexOf(selectedElement)===elements.length-1} onClick={()=>reorderElement(selectedElement.id,'front')}>To front</Button><Button variant="ghost" size="sm" disabled={elements.indexOf(selectedElement)===0} onClick={()=>reorderElement(selectedElement.id,'back')}>To back</Button><Button variant="ghost" size="sm" onClick={()=>removeElement(selectedElement.id)}>Delete</Button></div>
     </fieldset>}
     <div className="mt-4 flex flex-wrap items-center gap-2"><Button variant="secondary" size="sm" disabled={!elementHistory.past.length} onClick={()=>setElementHistory(history=>historyUndo(history))}>Undo</Button><Button variant="secondary" size="sm" disabled={!elementHistory.future.length} onClick={()=>setElementHistory(history=>historyRedo(history))}>Redo</Button><p className="text-xs text-muted">⌘/Ctrl + Z · arrows nudge · Delete removes · Shift rotates in 15° steps</p></div>
    </section>
   </div>
   <section className="post-studio-preview" aria-label="Social post preview and download">
    <div className="mb-3 flex items-center justify-between gap-3"><p className="post-studio-step">04 · MAKE IT A POST</p><span className="text-xs text-muted">{POST_SIZES.find(item=>item.id===size)?.width} × {POST_SIZES.find(item=>item.id===size)?.height}</span></div>
    <figure className="post-canvas-frame"><div className="post-canvas-stack"><canvas ref={canvas} className="post-canvas-main" role="img" aria-label="Social post image preview" data-post-ready={Boolean(preview)} data-post-fits={preview?.fits===true} data-post-theme={preview?.theme} data-post-size={preview?.size} data-post-font={preview?.font} data-post-layout={preview?.layout} data-post-font-size={preview?.fontSize} data-post-elements={preview?.elements} style={{aspectRatio:`1080 / ${POST_SIZES.find(item=>item.id===size)?.height}`}}/><canvas ref={overlayCanvas} className="post-element-overlay" role="application" tabIndex={0} aria-label="Element layer. Drag to move, corner handles resize, the round handle rotates. Arrow keys nudge the selected layer." onPointerDown={beginElementDrag} onPointerMove={dragElement} onPointerUp={endElementDrag} onPointerCancel={endElementDrag}/></div><figcaption className="sr-only">{caption}</figcaption></figure>
    {elements.length>0 && <p className="mt-2 text-xs text-muted">{selectedElement?'Layer selected. Drag on the preview to move it.':'Select a layer on the preview or in the list to edit it.'}</p>}
    <Button variant="ghost" size="sm" className="mt-2" disabled={!preview || busy} onClick={()=>setExpanded(canvas.current.toDataURL('image/png'))}>Enlarge preview</Button>
    {source && <p className="mt-3 text-xs text-muted">{categoryLabel[source.category] || 'Discussion'} · {showName && source.name?`Attributed to ${source.name}`:'Name hidden'}{commentText!==source.content?' · Custom post text':''}</p>}
    {renderError && <p role="alert" className="mt-3 text-sm text-crimson-bright">{renderError}</p>}
    {preview && !preview.fits && <p role="alert" className="mt-3 text-sm text-crimson-bright">The full text does not fit this size. Reduce the main text size, choose Vertical, or turn off optional text. Download is paused so no words are cut off.</p>}
    <div className="mt-5 flex flex-wrap gap-2"><Button loading={busy} disabled={!source || !commentText.trim() || !preview?.fits || Boolean(renderError) || blocked} onClick={exportImage}><ArrowDownToLine size={18} aria-hidden="true"/>Download PNG</Button><Button variant="secondary" disabled={busy || !source || !commentText.trim() || blocked} onClick={copyCaption}><Copy size={16} aria-hidden="true"/>Copy caption</Button>{session && <Button variant="secondary" disabled={busy} onClick={exportQr}>Download QR only</Button>}</div>
    {error && <p role="alert" className="mt-3 text-sm text-crimson-bright">{error}</p>}{status && <p role="status" className="mt-3 text-sm text-gold-light">{status}</p>}
    <p className="mt-3 text-xs leading-relaxed text-muted">The download matches this preview. Upload it to your social app whenever you’re ready.</p>
    <details className="mt-5" open={captionOpen} onToggle={event=>setCaptionOpen(event.currentTarget.open)}><summary className="min-h-10 cursor-pointer text-sm text-muted">View caption</summary><textarea aria-label="Post caption" className="post-studio-select mt-2 min-h-40" readOnly value={caption} onFocus={event=>event.target.select()}/></details>
   </section>
  </div>
  <Dialog open={Boolean(expanded)} onClose={()=>setExpanded('')} title="Post preview" className="post-expanded-dialog">{expanded && <Image src={expanded} unoptimized width={1080} height={preview?.height || 1350} alt="Enlarged social post preview" className="h-auto w-full rounded-control"/>}<Button variant="secondary" className="mt-4" onClick={()=>setExpanded('')}>Close preview</Button></Dialog>
 </div>;
}
