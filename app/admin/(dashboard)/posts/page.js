import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getAdminToken} from '@/lib/auth';
import {getAdminSession,getAdminSubmission,listAdminSessions,listAdminSubmissions} from '@/lib/spill-api';
import {discussionSource,socialContribution,socialId} from '@/lib/social-posts';
import PostStudio from '@/components/social/PostStudio';
import ErrorState from '@/components/ui/ErrorState';
import {getSiteUrl} from '@/lib/config';
export const dynamic='force-dynamic';
export default async function PostsPage({searchParams}){
 const query=await searchParams,first=value=>Array.isArray(value)?value[0]:value;
 const requested=first(query?.session),postId=first(query?.post),token=await getAdminToken();
 if(requested && !socialId(requested))notFound();
 const recent=await listAdminSessions(token,{limit:100});
 if(!recent.ok)return <ErrorState title="Post Studio is unavailable" description="Could not load the discussions. Try again." retry={<Link href="/admin/posts" className="underline">Try again</Link>}/>;
 const sessions=recent.body?.items || [];let session=requested?sessions.find(item=>item.id===requested):sessions[0];
 if(requested && !session){const result=await getAdminSession(token,requested);if(result.status===404)notFound();if(!result.ok)return <ErrorState title="Could not load this discussion"/>;session=result.body.session;if(session)sessions.unshift(session);}
 let items=[],total=0,source=session?discussionSource(session):null,loadError='';
 if(session){
  const result=await listAdminSubmissions(token,{session_id:session.id,status:'approved',sort:'queue',limit:25});
  if(result.ok){items=(result.body.items || []).map(row=>socialContribution(row,session.id)).filter(Boolean);total=result.body.total || 0;}else loadError='Could not load contributions. You can still prepare the discussion topic.';
  if(postId){
   if(!socialId(postId))notFound();const selected=await getAdminSubmission(token,postId);
   const post=selected.ok?socialContribution(selected.body.row,session.id):null;
   if(post)source=post;else {source=null;loadError='That contribution is unavailable for sharing. Choose another approved contribution.';}
  }
 }
 return <PostStudio key={session?.id || 'empty'} sessions={sessions.map(({id,title,status})=>({id,title,status}))} session={session?{id:session.id,title:session.title,topic:session.topic,code:session.public_code,status:session.status,closesAt:session.closes_at}:null} initialItems={items} initialTotal={total} initialSource={source} initialError={loadError} hasMoreSessions={(recent.body?.total || 0)>100} siteUrl={getSiteUrl()}/>;
}
