import { NextResponse } from 'next/server';
import { getAdminToken, requireAdminApi } from '@/lib/auth';
import { getOrCreateParticipantId } from '@/lib/participant';
import { readEnv } from '@/lib/config';
import { isValidPublicCode } from '@/lib/session-code';
import { isSameOriginRequest } from '@/lib/request-origin';

async function proxy(request,context) {
  const {path=[]} = await context.params;
  const [kind,id,operation] = path;
  const admin = kind==='admin';
  if (path.length>3 || (admin ? !/^[a-f0-9-]{36}$/i.test(id || '') || operation : kind!=='public' || !isValidPublicCode(id || '') || (operation && !['respond','heartbeat'].includes(operation)))) return NextResponse.json({error:'Not found.'},{status:404});
  if ((admin || operation==='heartbeat') && !await requireAdminApi()) return NextResponse.json({error:'Not authorized.'},{status:401});
  if (!admin && ((request.method==='GET' && operation) || (request.method==='POST' && !operation))) return NextResponse.json({error:'Method not allowed.'},{status:405});
  let body;
  if (request.method==='POST') {
    if (!isSameOriginRequest(request)) return NextResponse.json({error:'Not authorized.'},{status:403});
    const maximum = admin ? 120000 : 1000;
    if (Number(request.headers.get('content-length'))>maximum) return NextResponse.json({error:'Request too large.'},{status:413});
    try {
      const raw = await request.text();
      if (raw.length>maximum) return NextResponse.json({error:'Request too large.'},{status:413});
      body = JSON.parse(raw);
      if (!body || typeof body!=='object' || Array.isArray(body)) throw Error();
    } catch { return NextResponse.json({error:'Invalid request.'},{status:400}); }
    if (!admin) body = operation==='heartbeat' ? {revision:body.revision,visible:body.visible} : {activityId:body.activityId,item:body.item,participant_id:await getOrCreateParticipantId(id)};
  }
  const env = readEnv();
  const headers = {Authorization:`Bearer ${env.SPILL_API_SECRET}`,'Content-Type':'application/json'};
  if (admin || operation==='heartbeat') headers['X-Admin-Token']=await getAdminToken();
  const query = admin && new URL(request.url).searchParams.get('export')==='aggregate' ? '?export=aggregate' : '';
  const endpoint = admin ? `/admin/director/${id}${query}` : `/director/${id}${operation ? `/${operation}` : ''}`;
  try {
    const response = await fetch(`${env.SPILL_API_URL}${endpoint}`,{method:request.method,headers,body:body ? JSON.stringify(body) : undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
    return NextResponse.json(await response.json(),{status:response.status,headers:{'Cache-Control':'no-store',...(query ? {'Content-Disposition':'attachment; filename="spill-aggregate.json"'} : {})}});
  } catch { return NextResponse.json({error:'The server response could not be confirmed. Retry the same action safely.'},{status:503}); }
}
export const GET=proxy;
export const POST=proxy;
