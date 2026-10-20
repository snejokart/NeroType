import assert from 'node:assert/strict';
const base=process.argv[2]??'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Smoke tests only run against a local preview.');
let cookie='';const email=`qa-${crypto.randomUUID()}@hero.invalid`;const password=crypto.randomUUID();
let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++;};
async function request(path,body,status=200,custom={}){
  const response=await fetch(`${base}/api/${path}`,{headers:{...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...custom},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})});
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data={error:raw};}assert.equal(response.status,status,JSON.stringify(data));checks++;
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return data;
}
const health=await request('health');check(health.database==='connected','DB connected');
const guest=await request('bootstrap?tz=420');check(guest.user.guest,'guest account');
const config={mode:'words',language:'en',duration:15,difficulty:'easy',codeLanguage:'python'};
const exercise=await request('exercise',config);await request(`exercise/${exercise.id}/start`,{});
await request(`exercise/${exercise.id}/finish`,{events:[{key:exercise.content[0],t:0}],elapsed:15000},400);
await request('exercise',{...config,mode:'__proto__'},400);
await request('exercise',config,403,{Origin:'https://unrelated.invalid'});
await new Promise(r=>setTimeout(r,15100));
const letters=exercise.content.slice(0,60);const events=Array.from(letters,(key,i)=>({key,t:i*180}));
events.splice(4,0,{key:'~',t:600});
const finished=await request(`exercise/${exercise.id}/finish`,{events,elapsed:15000});
check(finished.result.correct===60,'server replay correct count');check(finished.result.errors===1,'server replay errors');check(finished.result.wpm===48,'WPM calculation');check(finished.result.xp>0,'XP awarded');
const duplicate=await request(`exercise/${exercise.id}/finish`,{events,elapsed:15000});check(duplicate.duplicate,'idempotency');check(duplicate.profile.stats.sessions===1,'no duplicate result');
const registered=await request('register',{name:'Проверка API',email,password});check(registered.user.id===guest.user.id,'guest progress migration');check(registered.stats.sessions===1,'registration retains result');
await request('logout',{});await request('login',{email,password:'incorrect-password'},401);
const restored=await request('login',{email,password});check(restored.xp===registered.xp,'progress restored after login');
for(const period of ['today','week','all'])for(const metric of ['wpm','accuracy','xp']){const board=await request(`leaderboard?period=${period}&metric=${metric}`);check(board.rows.some(r=>r.id===registered.user.id),'leaderboard inclusion');check(!JSON.stringify(board).includes(email),'email privacy');}
for(const mode of ['sentences','code','symbols']){const trial=await request('exercise',{...config,mode});check(trial.trial,'unopened modes can be previewed');}
console.log(JSON.stringify({checks,passed:true,fixtureUserId:registered.user.id,fixtureEmail:email},null,2));
