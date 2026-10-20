import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const command=process.argv[2]??'start';
const run=(args,options={})=>{
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',...options});
  if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);return result;
};
function install(){
  if(existsSync('node_modules/vinext/dist/cli.js'))return;
  const choices=[process.env.npm_execpath,join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')].filter(Boolean);
  const npm=choices.find(existsSync);if(!npm)throw new Error('Install Node.js LTS including npm, then run npm ci.');
  run([npm,'run','install:ci']);
}
function build(){run(['scripts/run-framework.mjs','build']);}
const dataDir=process.env.HERO_DATA_DIR??'.wrangler/state';
const wrangler=['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',dataDir];
function sql(command){
  const result=run([...wrangler,'--command',command,'--json'],{encoding:'utf8',stdio:['ignore','pipe','inherit']});
  return JSON.parse(result.stdout);
}
function migrate(){
  if(!existsSync('dist/server/wrangler.json'))build();
  sql('CREATE TABLE IF NOT EXISTS __hero_migrations (name TEXT PRIMARY KEY)');
  const current=sql('SELECT name FROM __hero_migrations');const applied=new Set(current.flatMap(r=>r.results??[]).map(r=>r.name));
  const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
  for(const entry of journal.entries){
    if(applied.has(entry.tag))continue;
    if(!/^[a-zA-Z0-9_]+$/.test(entry.tag))throw new Error('Invalid migration name');
    console.log(`Applying migration ${entry.tag}`);
    mkdirSync('.sites-runtime',{recursive:true});
    const file=join(root,'.sites-runtime','migration.sql');
    const migration=readFileSync(`drizzle/${entry.tag}.sql`,'utf8');
    writeFileSync(file,migration+`\nINSERT INTO __hero_migrations(name) VALUES('${entry.tag}');\n`);
    run([...wrangler,'--file',file]);
  }
}
install();
if(command==='setup'){build();migrate();console.log('Ready. Run node scripts/hero.mjs start');}
else if(command==='build')build();
else if(command==='migrate')migrate();
else if(command==='check'){run(['node_modules/typescript/bin/tsc','--noEmit']);run(['--test','tests/domain.test.mjs']);}
else if(command==='start'){migrate();run(['scripts/run-framework.mjs','dev','--port','5173','--hostname','127.0.0.1']);}
else if(command==='serve'){migrate();run(['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state','--ip','127.0.0.1','--port','5173','--inspector-port','0']);}
else throw new Error('Commands: start, setup, build, migrate, check, serve');
