import {demoSelections} from '../data/demo.js';
export const DEMO_STORAGE_KEY='sculp-memory-demo-300-v2';
const KEY=DEMO_STORAGE_KEY;
export function loadState(){try{localStorage.removeItem('sculp-memory-demo-v1');for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('sculpy-chat-v1:'))localStorage.removeItem(key)}return {...{selections:structuredClone(demoSelections),notes:[],memories:[],tour:0},...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {selections:structuredClone(demoSelections),notes:[],memories:[],tour:0}}}
export function saveState(state){try{localStorage.setItem(KEY,JSON.stringify(state));return true}catch{return false}}
export function resetState(){localStorage.removeItem(KEY);for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('sculpy-chat-300-v2:'))localStorage.removeItem(key)}}
