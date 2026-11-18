export const POST_SIZES=[{id:'portrait',label:'Portrait · 4:5',width:1080,height:1350},{id:'vertical',label:'Vertical · 9:16',width:1080,height:1920},{id:'square',label:'Square · 1:1',width:1080,height:1080}];
export const POST_THEMES=[
 {id:'aurora',label:'Violet aurora',background:'#111225',ink:'#fcf6ff',muted:'#c4bace',accent:'#e5c78c',glow:'#7461c9',secondary:'#267d82'},
 {id:'ivory',label:'Ivory editorial',background:'#f4eee4',ink:'#2c2330',muted:'#71606b',accent:'#934057',glow:'#ccb6a5',secondary:'#d9c7d8'},
 {id:'midnight',label:'Midnight gold',background:'#11101a',ink:'#fff5df',muted:'#c4baaa',accent:'#e5c78c',glow:'#74582f',secondary:'#453358'},
 {id:'velvet',label:'Crimson velvet',background:'#26101e',ink:'#fff0e9',muted:'#d8b7c6',accent:'#f1c791',glow:'#8b304b',secondary:'#5d3469'},
 {id:'grain-purple',label:'Grainy purple',background:'#261536',ink:'#fff4ff',muted:'#d4bddf',accent:'#efc99b',glow:'#8054a5',secondary:'#4c2a65'},
];
export const POST_FONTS=[{id:'fredoka',label:'Playful round · Fredoka',variable:'--font-post-fredoka',weight:500,minSize:32,leading:1.28},{id:'balsamiq',label:'Comic notebook · Balsamiq Sans',variable:'--font-post-balsamiq',weight:400,minSize:32,leading:1.28},{id:'patrick',label:'Handwritten · Patrick Hand',variable:'--font-post-patrick',weight:400,minSize:36,leading:1.25},{id:'caveat',label:'Loose marker · Caveat',variable:'--font-post-caveat',weight:500,minSize:40,leading:1.2},{id:'editorial',label:'Classic editorial',variable:'--font-instrument-serif',weight:400,minSize:32,leading:1.13}];
export const COMMUNITY_NAME='Grace Nation Wealthy Youths';
export const POST_LAYOUTS=[{id:'post',label:'Contribution post'},{id:'standalone',label:'Standalone post'},{id:'invitation',label:'Discussion invitation'},{id:'qr',label:'QR card'}];
export function discussionAvailability(session){
 if(!session)return 'Choose a discussion to include its topic, join link or QR code.';
 if(session.status==='draft')return 'Draft discussion: its join link is not public yet. Open the discussion before sharing the invitation.';
 if(session.status!=='live')return `${session.status==='paused'?'Paused':'Closed'} discussion: participants cannot submit new contributions. The invitation follows this existing status.`;
 if(session.closesAt && new Date(session.closesAt).getTime()<=Date.now())return 'This discussion has ended. Participants cannot submit new contributions.';
 return 'Live discussion: participants can join and submit contributions.';
}
export const POST_CATEGORIES={discussion:'DISCUSSION',question:'QUESTION',opinion:'OPINION',challenge:'SHAKE THE TABLE',twocents:'TWO CENTS'};
export const socialId=value=>typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function socialContribution(row,sessionId){
 if(!row || row.session_id!==sessionId || row.moderation_status!=='approved' || row.hidden_from_presentation || !Object.hasOwn(POST_CATEGORIES,row.category) || row.category==='discussion' || typeof row.content!=='string' || !row.content.trim())return null;
 return {id:row.id,content:row.content,category:row.category,name:typeof row.nickname==='string'?row.nickname.trim().slice(0,60):'',isPinned:Boolean(row.is_pinned)};
}
export function discussionSource(session){return {id:'discussion',category:'discussion',content:session.topic || session.title};}
export function quotedPostText(content,useQuotes=false){
 if(!useQuotes || !content)return content || '';
 const text=content.trim();if((text.startsWith('“') && text.endsWith('”')) || (text.startsWith('"') && text.endsWith('"')) || (text.startsWith('‘') && text.endsWith('’')))return text;
 return `“${content}”`;
}
export function postTopicText({source,topic='',showTopic=false,commentText}){
 const text=(commentText ?? source?.content ?? '').trim(),value=topic.trim();
 if(!showTopic || value===text || (source?.category==='discussion' && value===source.content.trim()))return '';
 return value;
}
export function socialCaption(options){
 const {source,title='',showTitle=false,showLink=false,discussionLink='',showName=false,useQuotes=false,showCategory=false,commentText}=options;
 const content=quotedPostText(commentText ?? source?.content,useQuotes),name=showName && source?.name?`\n— ${source.name}`:'';
 const parts=[options.showCommunityName?COMMUNITY_NAME:'',options.showGNWY?'GNWY':'',showTitle?title.trim():'',postTopicText(options),showCategory?POST_CATEGORIES[source?.category]:'',content+name,...(options.extraTexts || []).filter(item=>item.enabled).map(item=>item.text.trim()),options.eventWhen?.trim(),options.eventWhere?.trim(),showLink?discussionLink:''].filter(Boolean);
 return [...new Set(parts)].join('\n\n');
}
export function wrapPostText(text,maxWidth,measure){
 const lines=[];
 for(const paragraph of String(text).replace(/\r\n?/g,'\n').split('\n')){
  let line='';
  for(const word of paragraph.split(/\s+/u).filter(Boolean)){
   const candidate=line?`${line} ${word}`:word;
   if(measure(candidate)<=maxWidth){line=candidate;continue;}
   if(line){lines.push(line);line='';}
   if(measure(word)<=maxWidth){line=word;continue;}
   const units=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(word)].map(item=>item.segment):Array.from(word);
   for(const unit of units){if(line && measure(line+unit)>maxWidth){lines.push(line);line='';}line+=unit;}
  }
  lines.push(line);
 }
 return lines;
}
export function postFilename(source,size){
 const label=source?.category==='discussion'?'discussion':source?.category || 'post';
 return `spill-it-${label}-${String(source?.id || 'preview').replace(/[^a-z0-9-]/gi,'').slice(0,40)}-${size}.png`;
}
