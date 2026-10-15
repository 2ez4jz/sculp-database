import test from 'node:test';
import assert from 'node:assert/strict';
import {modelStatus} from '../src/components/chat/model-status.js';
test('status never treats history or a request in flight as a model connection',()=>{
 const turn={modelProfile:{model:'backend-model'},engine:'sdk'};
 assert.equal(modelStatus('idle',turn).state,'idle');
 assert.match(modelStatus('idle',turn).text,/上次模型/);
 assert.equal(modelStatus('busy',turn).state,'busy');
 assert.equal(modelStatus('ready',turn).state,'ready');
 assert.match(modelStatus('ready',turn).text,/backend-model/);
 assert.equal(modelStatus('error',turn).state,'error');
 assert.equal(modelStatus('ready',{}).state,'unknown');
 assert.match(modelStatus('ready',{engine:'local'}).text,/未调用模型/);
 assert.match(modelStatus('ready',{engine:'mock'},true).text,/No model call/);
 assert.match(modelStatus('ready',{...turn,agentFallback:true}).detail,/兼容路径/);
});
