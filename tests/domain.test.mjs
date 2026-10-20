import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({stdin:{contents:"export * from './lib/game.ts'; export * from './lib/corpus.ts'; export * from './lib/profile.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});
const {initialState,press,multiplier,metrics,replay,generateText,levelInfo,buildProfile} = await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
test('wrong and skipped characters do not advance; correct character does',()=>{
  let state=press(initialState(),'cat','a',0,50);assert.equal(state.position,0);assert.equal(state.errors,1);assert.equal(state.characters.c.errors,1);
  state=press(state,'cat','c',100,50);assert.equal(state.position,1);assert.equal(state.correct,1);assert.equal(state.xp,1);
});
test('combo multipliers and reset preserve maximum combo',()=>{
  assert.deepEqual([9,10,24,25,49,50].map(multiplier),[1,2,2,3,3,5]);
  const text='a'.repeat(100);let state=initialState();for(let i=0;i<50;i++)state=press(state,text,'a',i*100,90);
  assert.equal(state.score,595);state=press(state,text,'b',5100,90);assert.equal(state.combo,0);assert.equal(state.maxCombo,50);
});
test('random bonus doubles XP for exactly ten seconds',()=>{
  let state=press(initialState(),'aaaa','a',1000,1);assert.equal(state.xp,2);assert.equal(state.bonusUntil,11000);
  state=press(state,'aaaa','a',10999,1);assert.equal(state.xp,4);state=press(state,'aaaa','a',11000,1);assert.equal(state.xp,5);
});
test('standard WPM, CPM and weighted accuracy',()=>assert.deepEqual(metrics({correct:250,errors:10},60000),{cpm:250,wpm:50,accuracy:96.2}));
test('server replay rejects pasted strings, backwards time and late input',()=>{
  assert.throws(()=>replay('abc',[{key:'abc',t:0}],15000,50));
  assert.throws(()=>replay('abc',[{key:'a',t:100},{key:'b',t:90}],15000,50));
  assert.throws(()=>replay('abc',[{key:'a',t:15500}],15000,50));
});
test('error analysis records expected characters and adjacent combinations',()=>{
  const state=replay('cat',[{key:'c',t:0},{key:'x',t:100},{key:'a',t:200}],15000,50);
  assert.deepEqual(state.characters.a,{hits:1,errors:1});assert.deepEqual(state.characters.ca,{hits:1,errors:1});assert.equal(state.position,2);
});
test('level boundaries unlock progression',()=>{assert.equal(levelInfo(99).level,1);assert.equal(levelInfo(100).level,2);assert.equal(levelInfo(400).level,3);assert.equal(levelInfo(900).level,4);assert.equal(levelInfo(100).progress,0);});
for(const language of ['ru','en'])for(const mode of ['words','sentences','symbols','code']){
  test(`generates ${mode}/${language} exercises`,()=>{
    const text=generateText({mode,language,duration:60,difficulty:'normal',codeLanguage:'python'});assert.ok(text.length>=1500);
    if(mode==='words')for(const word of text.split(' '))assert.ok(word.length>=2&&word.length<=10);
    if(mode==='code')assert.ok(text.includes('\n'));
  });
}
test('profile does not invent history and trial sessions grant no XP',()=>{
  const p=buildProfile({id:'test',name:'test',email:null},[]);assert.equal(p.stats.sessions,0);assert.ok(p.history.every(h=>h.wpm===null));assert.equal(p.achievements.filter(a=>a.earned).length,0);
  const trial={id:'trial',mode:'code',language:'en',duration:15000,correct:50,errors:0,maxCombo:50,score:595,xp:200,wpm:40,cpm:200,accuracy:100,trial:1,characters:'{}',createdAt:Date.now()};
  const q=buildProfile({id:'test',name:'test',email:null},[trial]);assert.equal(q.xp,0);assert.equal(q.stats.sessions,1);
});
test('earned streak achievements survive a later break',()=>{
  const rows=[10,11,12].map((n)=>({id:String(n),mode:'words',language:'en',duration:15000,correct:50,errors:0,maxCombo:50,score:520,xp:50,wpm:40,cpm:200,accuracy:100,trial:0,characters:'{}',createdAt:Date.now()-n*86400000}));
  const p=buildProfile({id:'test',name:'test',email:null},rows);assert.equal(p.stats.streak,0);assert.equal(p.achievements.find(a=>a.id==='daily').earned,true);assert.equal(p.xp,150);
});
