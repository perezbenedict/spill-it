import {describe,it,expect} from 'vitest';
import {validateStandaloneCue,standaloneQuestions} from '../../api/stage-director';
import {EVENT_TEMPLATES} from '../../lib/event-templates';
describe('independent standalone preparation',()=>{
 it('accepts shared templates and rejects discussion-only sources',()=>{
  for(const t of EVENT_TEMPLATES)for(const [i,c] of t.cues.entries())expect(validateStandaloneCue({...c,id:`cue-${i}`})).not.toBeNull();
  for(const kind of ['contribution','poll'])expect(validateStandaloneCue({id:'bad',label:'Private source',kind,target:'another-session'})).toBeNull();
  expect(validateStandaloneCue({id:'waiting',label:'Wait',kind:'waiting'})).toEqual({id:'waiting',label:'Wait',kind:'waiting'});
 });
 it('bounds moderator-prepared priorities independently of discussion questions',()=>{
  expect(standaloneQuestions('questions',[' First? ','Second?'])).toEqual(['First?','Second?']);
  for(const value of [undefined,[],['Only one'],['Same',' Same '],['x'.repeat(301),'Valid'],Array.from({length:51},(_,i)=>String(i))])expect(standaloneQuestions('questions',value)).toBeNull();
  expect(standaloneQuestions('wordcloud',undefined)).toEqual([]);
 });
});
