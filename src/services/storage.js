import {demoSelections} from '../data/demo.js';
const KEY='sculp-memory-demo-v1';
export function loadState(){try{return {...{selections:demoSelections,notes:[],tour:0},...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {selections:demoSelections,notes:[],tour:0}}}
export function saveState(state){try{localStorage.setItem(KEY,JSON.stringify(state));return true}catch{return false}}
export function resetState(){localStorage.removeItem(KEY)}
