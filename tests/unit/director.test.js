import {describe,it,expect} from 'vitest';
import {validateCue,aggregateResults} from '../../api/director';
import {EVENT_TEMPLATES} from '../../lib/event-templates';

describe('private cue boundaries',()=>{
 it('bounds every cue type and never accepts arbitrary overlays',()=>{
  expect(validateCue({id:'test',label:'A',kind:'blackout'})).toBeNull();
  expect(validateCue({id:'test',label:'A',kind:'prompt',text:'x',duration:30})).toBeNull();
  expect(validateCue({id:'test',label:'A',kind:'reflection',text:'x',duration:3601})).toBeNull();
  expect(validateCue({id:'test',label:'A',kind:'announcement',text:'x'.repeat(1501)})).toBeNull();
  expect(validateCue({id:'test',label:'A',kind:'contribution',target:''})).toBeNull();
  expect(validateCue({id:'test',label:'A',kind:'waiting',secret:'discard'})).toEqual({id:'test',label:'A',kind:'waiting'});
 });
 it('validates prepared templates without changing live state',()=>{
  for(const template of EVENT_TEMPLATES)for(const [index,cue] of template.cues.entries())expect(validateCue({...cue,id:`cue-${index}`})).not.toBeNull();
 });
});
describe('aggregate result disclosure',()=>{
 const responses=Array.from({length:5},()=>({item:'3'}));
 it('omits results before explicit reveal and below the cohort threshold',()=>{
  expect(aggregateResults('scale',responses,false)).toBeNull();
  expect(aggregateResults('scale',responses.slice(0,4),true)).toBeNull();
 });
 it('formats bounded database groups using the full response total',()=>{
  expect(aggregateResults('scale',[{item:'4',count:9000},{item:'2',count:1000}],true,5,{total:10000,average:3.8})).toEqual({total:10000,items:[{label:'4',count:9000},{label:'2',count:1000}],average:3.8});
 });
 it('returns counts and numeric average without any participant identity',()=>{
  const result=aggregateResults('scale',responses.map(r=>({...r,participant_id:'private'})),true);
  expect(result).toEqual({total:5,items:[{label:'3',count:5}],average:3});
  expect(JSON.stringify(result)).not.toContain('private');
 });
});
