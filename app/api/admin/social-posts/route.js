import {NextResponse} from 'next/server';
import {getAdminToken,requireAdminApi} from '@/lib/auth';
import {getAdminSession,getAdminSubmission,listAdminSubmissions} from '@/lib/spill-api';
import {discussionSource,socialContribution,socialId} from '@/lib/social-posts';
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request){
 if(!await requireAdminApi())return reply({error:'Not authorized.'},401);
 const query=new URL(request.url).searchParams,sessionId=query.get('session');
 if(!socialId(sessionId))return reply({error:'Choose a discussion.'},400);
 const token=await getAdminToken(),selected=query.get('post');
 if(selected){
  if(selected!=='discussion' && !socialId(selected))return reply({error:'Choose a valid contribution.'},400);
  const discussion=await getAdminSession(token,sessionId);if(!discussion.ok)return reply({error:'This discussion is unavailable.'},discussion.status===404?404:503);
  const metadata={code:discussion.body.session.public_code,status:discussion.body.session.status,closesAt:discussion.body.session.closes_at};
  if(selected==='discussion'){
   return reply({source:discussionSource(discussion.body.session),...metadata});
  }
  const result=await getAdminSubmission(token,selected);if(!result.ok)return reply({error:'This contribution is unavailable. Choose another post.'},result.status===404?404:503);
  const source=socialContribution(result.body.row,sessionId);
  return source?reply({source,...metadata}):reply({error:'This contribution is no longer approved and visible. Choose another post.'},409);
 }
 const page=Math.max(1,Math.min(10000,Number.parseInt(query.get('page'),10)||1)),q=(query.get('q')||'').trim().slice(0,100);
 const result=await listAdminSubmissions(token,{session_id:sessionId,status:'approved',sort:'queue',limit:25,page,...(q?{search:q}:{})});
 if(!result.ok)return reply({error:'Could not load the contributions. Try again.'},503);
 return reply({items:(result.body.items || []).map(row=>socialContribution(row,sessionId)).filter(Boolean),total:result.body.total || 0,page});
}
