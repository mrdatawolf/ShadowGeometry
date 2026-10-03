import {nodes} from './geometry.js';
const KEY='sixForces.overrides';
const ids=nodes.map(n=>n.id);
let defaults, shipped=[], overrides={}, slices=[];
const defaultPreferences={snapEnabled:true,snapDistancePixels:18,stereoSeparationDegrees:4,stereoSpacingEm:29,stereoLabelsEnabled:false};
let preferences={...defaultPreferences};
const listeners=new Set();
export const getLabel=id=>overrides[id] ?? defaults?.[id] ?? id;
export const getSlices=()=>structuredClone(slices);
export const getPreferences=()=>({...preferences});
export const getExportData=()=>({labels:Object.fromEntries(ids.map(id=>[id,getLabel(id)])),slices:getSlices(),preferences:getPreferences()});
export function setPreferences(updates){preferences=validatePreferences({...preferences,...updates});persist();}
export const subscribe=fn=>{listeners.add(fn);return ()=>listeners.delete(fn);};
export let persistenceMessage='';
function notify(){for(const fn of listeners) fn();}
function persist(){
  try{localStorage.setItem(KEY,JSON.stringify({labels:overrides,slices,preferences,replaceSlices:true})); persistenceMessage='Saved locally';}
  catch {persistenceMessage='Browser storage unavailable; export to keep your changes.';}
  notify();
}
function validateLabels(value){
  if(!value || typeof value!=='object' || Array.isArray(value)) throw Error('Labels must be an object.');
  const result={};
  for(const id of ids) if(Object.hasOwn(value,id)) {
    if(typeof value[id]!=='string' || !value[id].trim() || value[id].length>120) throw Error(`Invalid label for ${id}. Use 1–120 characters.`);
    result[id]=value[id];
  }
  return result;
}
function validatePreferences(value){
  if(value===undefined)return {...defaultPreferences};
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('Preferences must be an object.');
  const result={...defaultPreferences,...value};
  if(typeof result.snapEnabled!=='boolean')throw Error('Snap enabled must be a boolean.');
  if(!Number.isInteger(result.snapDistancePixels)||result.snapDistancePixels<4||result.snapDistancePixels>80)throw Error('Snap distance must be a whole number from 4 to 80 pixels.');
  if(typeof result.stereoSeparationDegrees!=='number'||!Number.isFinite(result.stereoSeparationDegrees)||result.stereoSeparationDegrees<0||result.stereoSeparationDegrees>12)throw Error('Stereo separation must be from 0 to 12 degrees.');
  if(typeof result.stereoLabelsEnabled!=='boolean')throw Error('Stereo labels enabled must be a boolean.');
  if(typeof result.stereoSpacingEm!=='number'||!Number.isFinite(result.stereoSpacingEm)||result.stereoSpacingEm<8||result.stereoSpacingEm>40)throw Error('Image spacing must be from 8 to 40 em.');
  return {snapEnabled:result.snapEnabled,snapDistancePixels:result.snapDistancePixels,stereoSeparationDegrees:result.stereoSeparationDegrees,stereoSpacingEm:result.stereoSpacingEm,stereoLabelsEnabled:result.stereoLabelsEnabled};
}
function validateSlices(value){
  if(!Array.isArray(value)) throw Error('Slices must be an array.');
  const seen=new Set();
  return value.map(s=>{
    if(!s || typeof s.id!=='string' || !s.id || seen.has(s.id) || typeof s.name!=='string' || !s.name.trim() || s.name.length>120 || typeof s.createdAt!=='string' || !Number.isFinite(Date.parse(s.createdAt))) throw Error('Invalid or duplicate slice bookmark.');
    for(const field of ['position','target']) if(!Array.isArray(s.camera?.[field]) || s.camera[field].length!==3 || !s.camera[field].every(v=>typeof v==='number' && Number.isFinite(v) && Math.abs(v)<1e6)) throw Error('Invalid camera coordinates.');
    if(Math.hypot(...s.camera.position.map((v,i)=>v-s.camera.target[i]))<0.01) throw Error('Camera must be outside its target.');
    seen.add(s.id); return structuredClone(s);
  });
}
export async function loadConfig(){
  // file:// commonly blocks fetch and modules. Inline defaults allow fetching to
  // fail gracefully on browsers which do permit local ES modules.
  const fallback=JSON.parse(document.querySelector('#default-labels').textContent);
  const results=await Promise.allSettled(['labels.default.json','slices.default.json'].map(async url=>{
    const response=await fetch(url);if(!response.ok) throw Error(url);return response.json();
  }));
  defaults=validateLabels(results[0].status==='fulfilled'?results[0].value:fallback);
  for(const id of ids) if(!defaults[id]) defaults[id]=fallback[id] ?? id;
  shipped=validateSlices(results[1].status==='fulfilled'?results[1].value:[]);
  slices=structuredClone(shipped);
  preferences={...defaultPreferences};overrides={};
  try{
    const stored=JSON.parse(localStorage.getItem(KEY)||'null');
    if(stored){ overrides=validateLabels(stored.labels||{});const local=validateSlices(stored.slices||[]);
      preferences=validatePreferences(stored.preferences);
      // Normal first-load merging appends local bookmarks. A full snapshot flag
      // preserves deletes/renames of shipped bookmarks and imported replacement.
      slices=stored.replaceSlices?local:[...shipped.filter(s=>!local.some(l=>l.id===s.id)),...local];
    }
  }catch{persistenceMessage='Stored configuration could not be loaded; defaults are active.';overrides={};slices=structuredClone(shipped);preferences={...defaultPreferences};}
  notify();
}
export function renameLabel(id,value){if(!ids.includes(id)) throw Error('Unknown point.');Object.assign(overrides,validateLabels({[id]:value}));persist();}
export function saveSlice(name,camera){const entry={id:globalThis.crypto?.randomUUID?.()||`slice-${Date.now()}-${Math.random().toString(36).slice(2)}`,name:name.trim(),camera,createdAt:new Date().toISOString()};validateSlices([entry]);slices.push(entry);persist();}
export function renameSlice(id,name){const next=slices.map(s=>s.id===id?{...s,name:name.trim()}:s);slices=validateSlices(next);persist();}
export function deleteSlice(id){slices=slices.filter(s=>s.id!==id);persist();}
export function exportConfig(){
  const blob=new Blob([JSON.stringify(getExportData(),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob), anchor=document.createElement('a');
  anchor.href=url;anchor.download=`six-forces-export-${new Date().toISOString().slice(0,10)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function importConfig(file){
  const parsed=JSON.parse(await file.text());const labels=validateLabels(parsed.labels), bookmarks=validateSlices(parsed.slices);
  const importedPreferences=validatePreferences(parsed.preferences);
  if(!ids.every(id=>Object.hasOwn(labels,id))) throw Error('Import must include all 14 labels.');
  if(!confirm('Replace all current labels, slice bookmarks, and preferences with this file?')) return false;
  overrides=labels;slices=bookmarks;preferences=importedPreferences;persist();return true;
}
