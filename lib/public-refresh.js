// Content-free wakeups: a projector always rereads its authorized public API.
// Never broadcast admin snapshots, prepared cues, votes or scripture drafts.
const eventName='spill-public-refresh';
const source=typeof window==='undefined'?'server':crypto.randomUUID();
export function signalPublicRefresh(){
 if(typeof window==='undefined')return;
 window.dispatchEvent(new Event(eventName));
 if(window.BroadcastChannel){const channel=new window.BroadcastChannel(eventName);channel.postMessage({type:'refresh',source});channel.close();}
}
export function listenForPublicRefresh(refresh){
 if(typeof window==='undefined')return()=>{};
 let timer;
 const wake=()=>{clearTimeout(timer);timer=setTimeout(refresh,50);};
 const channel=window.BroadcastChannel?new window.BroadcastChannel(eventName):null;
 if(channel)channel.onmessage=event=>{if(event.data?.type==='refresh' && event.data.source!==source)wake();};
 window.addEventListener(eventName,wake);
 return()=>{clearTimeout(timer);channel?.close();window.removeEventListener(eventName,wake);};
}
