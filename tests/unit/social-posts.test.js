import {expect,test} from 'vitest';
import {discussionAvailability,discussionSource,POST_SIZES,postFilename,socialCaption,socialContribution,socialId,quotedPostText,wrapPostText} from '../../lib/social-posts';
const row={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',session_id:'session',content:'Could listening change the conversation?',category:'question',moderation_status:'approved',hidden_from_presentation:false,nickname:'Private nickname',participant_id:'private-id'};
test('social sources use approved visible contributions and expose only the display nickname',()=>{
 expect(socialContribution(row,'session')).toEqual({id:row.id,content:row.content,category:'question',name:'Private nickname',isPinned:false});
 for(const changed of [{moderation_status:'pending'},{moderation_status:'hidden'},{hidden_from_presentation:true},{category:'unknown'},{content:'  '}])expect(socialContribution({...row,...changed},'session')).toBeNull();
 expect(socialContribution(row,'another-session')).toBeNull();expect(socialId(row.id)).toBe(true);expect(socialId('../secret')).toBe(false);
});
test('captions support arbitrary optional titles, topics and links without repeating the discussion',()=>{
 const source=discussionSource({topic:'What does community mean?',title:'Discussion'});
 expect(socialCaption({source,topic:source.content,showTopic:true})).toBe(source.content);
 expect(socialCaption({source:{content:row.content},title:'A question worth asking',showTitle:true,topic:'Listening well',showTopic:true,showLink:true,discussionLink:'https://example.com/join/ABCDEFGH'})).toBe(`A question worth asking\n\nListening well\n\n${row.content}\n\nhttps://example.com/join/ABCDEFGH`);
 expect(socialCaption({source:{content:row.content},title:'Top 10',showTitle:false,showTopic:false,showLink:false,discussionLink:'private-link'})).toBe(row.content);
});
test('text wrapping keeps all words, explicit paragraphs and complete emoji graphemes',()=>{
 const measure=value=>Array.from(value).length;
 expect(wrapPostText('We can listen\n\nWe can learn',8,measure)).toEqual(['We can','listen','','We can','learn']);
 expect(wrapPostText('averylongunbrokentoken',5,measure).join('')).toBe('averylongunbrokentoken');
 const emoji='👨‍👩‍👧‍👦';expect(wrapPostText(`${emoji}${emoji}`,1,measure)).toEqual([emoji,emoji]);
});
test('exports use explicit 1080-pixel sizes and safe filenames',()=>{
 expect(POST_SIZES.map(item=>[item.width,item.height])).toEqual([[1080,1350],[1080,1920],[1080,1080]]);
 expect(postFilename({id:'../../private?value',category:'question'},'portrait')).not.toMatch(/[/?]/);
});

test('post-only corrections, attribution, quote marks and category labels are independent',()=>{
 const source=socialContribution(row,'session'),original=JSON.stringify(source);
 expect(socialCaption({source,commentText:'Corrected wording.',showName:true,useQuotes:true,showCategory:true})).toBe('QUESTION\n\n“Corrected wording.”\n— Private nickname');
 expect(socialCaption({source,commentText:'Corrected wording.',showName:false,useQuotes:false,showCategory:false})).toBe('Corrected wording.');
 expect(JSON.stringify(source)).toBe(original);expect(quotedPostText('“Already quoted.”',true)).toBe('“Already quoted.”');
});

 test('standalone captions include only enabled independent blocks and community labels',()=>{
 const options={source:{id:'standalone',category:'standalone',content:''},commentText:'Our voices matter.',title:'Top ten thoughts',showTitle:true,extraTexts:[{enabled:true,text:'Sunday recap'},{enabled:false,text:'Hidden note'},{enabled:true,text:'Join us next Sunday.'}],showCommunityName:true,showGNWY:false};
 expect(socialCaption(options)).toBe('Grace Nation Wealthy Youths\n\nTop ten thoughts\n\nOur voices matter.\n\nSunday recap\n\nJoin us next Sunday.');
 expect(socialCaption({...options,showCommunityName:false,showGNWY:true})).toMatch(/^GNWY\n/);
 expect(socialContribution({...row,is_pinned:true},'session').isPinned).toBe(true);
 });

test('invitations accurately explain existing discussion availability',()=>{
 expect(discussionAvailability({status:'draft'})).toContain('not public yet');
 expect(discussionAvailability({status:'live'})).toContain('can join and submit');
 for(const status of ['paused','closed'])expect(discussionAvailability({status})).toContain('cannot submit');
 expect(discussionAvailability({status:'live',closesAt:'2020-01-01T00:00:00Z'})).toContain('has ended');
});
