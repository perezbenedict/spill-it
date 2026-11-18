import {COMMUNITY_NAME,POST_CATEGORIES,POST_FONTS,POST_SIZES,POST_THEMES,postTopicText,quotedPostText,wrapPostText} from './social-posts';
import {drawPostElements} from './post-elements';

let emblemPromise;
const qrCache=new Map();
export async function prepareQrMatrix(url){
 if(!url)throw Error('Choose a discussion for its QR code.');
 if(!qrCache.has(url)){const QRCode=await import('qrcode');const matrix=(QRCode.default || QRCode).create(url,{errorCorrectionLevel:'M'}).modules;if(qrCache.size>=8)qrCache.delete(qrCache.keys().next().value);qrCache.set(url,matrix);}
 return qrCache.get(url);
}
export function drawPostQr(ctx,matrix,x,y,side){
 const cell=Math.floor(side/(matrix.size+8)),actual=cell*(matrix.size+8),left=Math.round(x+(side-actual)/2),top=Math.round(y+(side-actual)/2);
 ctx.save();ctx.fillStyle='#ffffff';ctx.fillRect(Math.floor(x),Math.floor(y),Math.ceil(side),Math.ceil(side));ctx.fillStyle='#111111';
 for(let row=0;row<matrix.size;row++)for(let col=0;col<matrix.size;col++)if(matrix.data[row*matrix.size+col])ctx.fillRect(left+(col+4)*cell,top+(row+4)*cell,cell,cell);
 ctx.restore();return cell>=4;
}
export async function rawQrCanvas(url){const matrix=await prepareQrMatrix(url),canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;drawPostQr(canvas.getContext('2d'),matrix,0,0,1024);return canvas;}
export async function preparePostAssets(showEmblem,fontId='fredoka',qrUrl=''){
 const style=getComputedStyle(document.querySelector('[data-post-fonts]') || document.documentElement),display=style.getPropertyValue('--font-instrument-serif').trim() || 'Georgia',body=style.getPropertyValue('--font-sans').trim() || 'Arial';
 const font=POST_FONTS.find(item=>item.id===fontId) || POST_FONTS[0],family=style.getPropertyValue(font.variable).trim();
 if(!family)throw Error('The selected comment font could not load. Refresh the editor and try again.');
 await Promise.all([document.fonts.load(`400 64px ${display}`),document.fonts.load(`500 36px ${body}`),document.fonts.load(`${font.weight} 64px ${family}`)]);
 if(showEmblem && !emblemPromise)emblemPromise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{emblemPromise=null;reject(Error('The emblem could not be loaded. Try again.'));};image.src='/spill-emblem.svg';});
 return {display,body,comment:{...font,family},emblem:showEmblem?await emblemPromise:null,qr:qrUrl?await prepareQrMatrix(qrUrl):null};
}
let grainTile;
function drawGrain(ctx,amount){
 if(!grainTile){
  grainTile=document.createElement('canvas');grainTile.width=192;grainTile.height=192;
  const tile=grainTile.getContext('2d'),image=tile.createImageData(192,192);let seed=734291;
  for(let i=0;i<image.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const value=(seed>>>24)&1?255:0;image.data[i]=value;image.data[i+1]=value;image.data[i+2]=value;image.data[i+3]=40+((seed>>>8)%90);}
  tile.putImageData(image,0,0);
 }
 ctx.save();ctx.globalAlpha=Math.min(.4,Math.max(0,amount));ctx.fillStyle=ctx.createPattern(grainTile,'repeat');ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();
}
function fit(ctx,text,{font,weight=400,maxSize,minSize,width,height,leading=1.2}){
 let result;
 for(let size=maxSize;size>=minSize;size-=2){
  ctx.font=`${weight} ${size}px ${font}`;
  const lines=wrapPostText(text,width,value=>ctx.measureText(value).width),lineHeight=size*leading;
  result={lines,size,lineHeight,height:lines.length*lineHeight,fits:lines.length*lineHeight<=height && lines.every(line=>ctx.measureText(line).width<=width+.5),font:`${weight} ${size}px ${font}`};
  if(result.fits)return result;
 }
 return result;
}
function copy(ctx,layout,x,y,color){ctx.font=layout.font;ctx.fillStyle=color;layout.lines.forEach((line,index)=>ctx.fillText(line,x,y+index*layout.lineHeight));}
function glow(ctx,x,y,r,color){const gradient=ctx.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,color+'75');gradient.addColorStop(1,color+'00');ctx.fillStyle=gradient;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);}
export function drawSocialPost(canvas,options,assets){
 const size=POST_SIZES.find(item=>item.id===options.size) || POST_SIZES[0],theme=POST_THEMES.find(item=>item.id===options.theme) || POST_THEMES[0];
 canvas.width=size.width;canvas.height=size.height;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image export is unavailable in this browser.');
 const {width:w,height:h}=size,pad=96,width=w-pad*2,vertical=options.size==='vertical';
 ctx.textBaseline='top';ctx.fillStyle=theme.background;ctx.fillRect(0,0,w,h);
 glow(ctx,w*.93,h*.2,w*.9,theme.glow);glow(ctx,w*.1,h*.88,w*.7,theme.secondary);
 ctx.save();ctx.strokeStyle=theme.accent;ctx.globalAlpha=.13;ctx.lineWidth=1;
 for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(w*1.08,h*.67,w*(.48+i*.075),h*(.42+i*.03),-.3,0,Math.PI*2);ctx.stroke();}
 ctx.strokeRect(40,40,w-80,h-80);ctx.restore();
 ctx.save();ctx.fillStyle=theme.ink;ctx.globalAlpha=.035;
 for(let i=0;i<600;i++)ctx.fillRect((i*163+41)%w,(i*347+67)%h,1.2,1.2);
 ctx.restore();
 if(options.useGrain)drawGrain(ctx,options.grainAmount ?? .22);
 let y=vertical?146:90;
 if(options.showEmblem && assets.emblem){ctx.drawImage(assets.emblem,(w-80)/2,y,80,80);y+=96;}
 if(options.showLogo){ctx.save();ctx.textAlign='center';ctx.fillStyle=theme.ink;ctx.font=`400 56px ${assets.display}`;ctx.fillText('Spill It',w/2,y);ctx.restore();y+=80;}
 if(!options.showLogo && !options.showEmblem)y+=22;
 for(const text of [options.showCommunityName?COMMUNITY_NAME:'',options.showGNWY?'GNWY':''].filter(Boolean)){ctx.save();ctx.textAlign='center';ctx.fillStyle=theme.accent;ctx.font=`500 23px ${assets.body}`;ctx.fillText(text,w/2,y);ctx.restore();y+=40;}
 if(options.showCategory!==false){ctx.fillStyle=theme.accent;ctx.font=`600 18px ${assets.body}`;ctx.fillText(POST_CATEGORIES[options.source?.category] || 'FROM THE CONVERSATION',pad,y);y+=48;}
 let fits=true;
 const title=options.showTitle?options.title?.trim():'';
 if(title){const layout=fit(ctx,title,{font:assets.display,maxSize:86,minSize:44,width,height:205,leading:1.05});copy(ctx,layout,pad,y,theme.ink);fits&&=layout.fits;y+=layout.height+30;}
 const topic=postTopicText(options);
 if(topic){
  const layout=fit(ctx,topic,{font:assets.body,weight:500,maxSize:30,minSize:24,width,height:114,leading:1.35});copy(ctx,layout,pad,y,theme.muted);fits&&=layout.fits;y+=layout.height+32;
 }
 const name=options.showName && options.source?.name?`— ${options.source.name}`:'',nameHeight=name?110:0;
 const footerY=h-(vertical?224:120),bodyTop=y+24;
 const extras=[...(options.extraTexts || []).filter(item=>item.enabled).map(item=>item.text.trim()),options.eventWhen?.trim(),options.eventWhere?.trim()].filter(Boolean).map(text=>fit(ctx,text,{font:assets.body,weight:500,maxSize:28,minSize:22,width,height:100,leading:1.3}));
 const extraHeight=extras.reduce((sum,item)=>sum+item.height+18,0);
 const qrOnly=options.layout==='qr',hasQr=Boolean(options.showQR && assets.qr),qrSide=options.size==='square'?280:320;
 const qrBottom=footerY-(options.showLink?32:24),qrTop=qrOnly?0:qrBottom-qrSide;
 const bodyBottom=(hasQr && !qrOnly?qrTop-32:footerY-(options.showLink?94:38))-nameHeight-extraHeight;
 const available=qrOnly?Math.min(160,Math.max(0,footerY-bodyTop-extraHeight-380)):bodyBottom-bodyTop;
 const text=quotedPostText(options.commentText ?? options.source?.content ?? 'Choose a discussion or a contribution. Give it a beautiful place to be heard.',options.useQuotes);
 const font=assets.comment,manual=Number.isFinite(options.fontSize)?Math.max(24,Math.min(180,options.fontSize)):null;
 const layout=fit(ctx,text,{font:font.family,weight:font.weight,maxSize:manual ?? (qrOnly?64:vertical?112:options.size==='square'?86:100),minSize:manual ?? font.minSize,width,height:Math.max(0,available),leading:font.leading});fits&&=layout.fits;
 const bodyY=bodyTop+(qrOnly?0:Math.max(0,(available-layout.height)*.45));
 ctx.save();ctx.beginPath();ctx.rect(pad,bodyTop,width,Math.max(0,available));ctx.clip();copy(ctx,layout,pad,bodyY,theme.ink);ctx.restore();
 let afterBody=bodyY+layout.height+26;
 if(name){const attribution=fit(ctx,name,{font:assets.body,weight:500,maxSize:30,minSize:24,width,height:84,leading:1.3});copy(ctx,attribution,pad,afterBody,theme.muted);fits&&=attribution.fits;afterBody+=attribution.height+26;}
 for(const extra of extras){copy(ctx,extra,pad,afterBody,theme.muted);fits&&=extra.fits;afterBody+=extra.height+18;}
 if(hasQr){
  if(qrOnly){const room=qrBottom-afterBody-46,side=Math.floor(Math.min(600,width,room));if(side>0)fits=drawPostQr(ctx,assets.qr,(w-side)/2,afterBody,side) && fits;else fits=false;ctx.fillStyle=theme.accent;ctx.font=`500 22px ${assets.body}`;ctx.textAlign='center';ctx.fillText('SCAN TO JOIN THE DISCUSSION',w/2,afterBody+Math.max(0,side)+18);ctx.textAlign='left';}
  else{fits=drawPostQr(ctx,assets.qr,pad,qrTop,qrSide) && fits;const cta=fit(ctx,'Scan to join the discussion',{font:assets.display,maxSize:46,minSize:32,width:width-qrSide-36,height:160,leading:1.12});copy(ctx,cta,pad+qrSide+36,qrTop+54,theme.ink);fits&&=cta.fits;}
 }
 ctx.strokeStyle=theme.accent+'66';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad,footerY);ctx.lineTo(w-pad,footerY);ctx.stroke();
 ctx.font=`500 19px ${assets.body}`;ctx.fillStyle=theme.muted;
 if(options.showLink && options.discussionLink){
  ctx.fillStyle=theme.accent;ctx.fillText('JOIN THE CONVERSATION',pad,footerY+24);
  const displayLink=options.discussionLink.replace(/^https?:\/\//,'').replace(/\/$/,'');
  const link=fit(ctx,displayLink,{font:assets.body,maxSize:24,minSize:18,width,height:60,leading:1.2});copy(ctx,link,pad,footerY+58,theme.ink);fits&&=link.fits;
 }else if(options.layout!=='standalone')ctx.fillText(options.layout==='invitation' || qrOnly?'Join the conversation.':'A thought worth sitting with.',pad,footerY+24);
 // The free-positioned element layer paints on top of the base layout in the
 // same pass, so preview and download are always the same pixels.
 const elements=options.elements || [];
 const elementsFitAll=drawPostElements(ctx,elements,{theme,assets,width:w,height:h});
 return {fits:fits && elementsFitAll,fontSize:layout.size,width:w,height:h,theme:theme.id,size:size.id,font:font.id,layout:options.layout || 'post',elements:elements.length};
}
export function socialPostBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not create the image. Try again.')),'image/png'));}
