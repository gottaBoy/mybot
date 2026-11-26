import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
assert.equal(process.env.MYBOT_BROWSER_FIXTURE,'1')
const base=process.env.MYBOT_FRONTEND_URL??'http://127.0.0.1:5176/',origin=new URL(base).origin
assert.equal(new URL(base).hostname,'127.0.0.1');assert.ok(!['4180','5173'].includes(new URL(base).port))
const fixture=process.env.CODING_FIXTURE_DIR
assert.match(fixture??'',/^\/tmp\/mybot-astryx-workbench\.[A-Za-z0-9_-]+$/)
const out=resolve(process.env.CODING_EVIDENCE_DIR??'/tmp/mybot-coding')
await mkdir(out,{recursive:true})
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE??'/tmp/mybot-browser-tools/node_modules/playwright/index.mjs').href)
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'})
const report={fixture:true,checks:[],errors:[],external:[],writes:[],geometry:[],screenshots:[]}
const check=text=>{report.checks.push(text);console.log(`PASS ${text}`)}
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true})
await context.addInitScript(()=>{if(!localStorage.getItem('mybot.locale'))localStorage.setItem('mybot.locale','en')})
context.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/')&&request.method()!=='GET')report.writes.push({path:url.pathname,method:request.method()})})
await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.protocol.startsWith('http')&&url.origin!==origin){report.external.push(url.origin);return route.abort()}return route.continue()})
const page=await context.newPage()
page.on('pageerror',error=>report.errors.push(error.message))
async function capture(file){
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.waitForFunction(()=>window.scrollY===0)
  await page.screenshot({path:resolve(out,file),fullPage:true})
}
async function api(path,body){
  return page.evaluate(async({path,body})=>{
    const response=await fetch(`/api${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Workbench-Request':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})})
    return {status:response.status,data:await response.json()}
  },{path,body})
}
async function poll(read,label){
  for(let i=0;i<150;i++){if(await read())return;await new Promise(resolve=>setTimeout(resolve,100))}
  throw new Error(`Timed out: ${label}`)
}
try{
  const original=await readFile(resolve(fixture,'workspace/workbench/schemas.py'),'utf8')
  const immutable=await readFile(resolve(fixture,'workspace/test_relative_path.py'),'utf8')
  await page.goto(base);assert.equal((await api('/auth',{token:'astryx-browser-fixture'})).status,200)
  const baseline=(await api('/bootstrap')).data
  assert.equal(baseline.tasks.length,0);assert.equal(baseline.capabilities.isolated_coding,true)
  const project=(await api('/projects',{name:'mybot core coding acceptance',directory:'.',notes:'Copied mybot source; no original-project writes'})).data
  const model=(await api('/models',{name:'Deterministic coding fixture',model:'coding-fixture',endpoint:'http://127.0.0.1:9999/v1',key_env:''})).data
  const task=(await api('/tasks',{project_id:project.id,title:'拒绝路径中的控制字符',goal:'Update mybot relative_path to reject newline and tab while preserving ordinary and Chinese source paths.',
    acceptance:'All four immutable unittest cases pass; the original project remains unchanged.',
    files:['workbench/__init__.py','workbench/schemas.py','workbench/saved_views.py','test_relative_path.py']})).data
  await page.goto(`${base}#task/${task.id}`);await page.reload()
  await page.getByRole('button',{name:'Implement & validate',exact:true}).click()
  const panel=()=>page.getByRole('dialog',{name:'Implement & validate',exact:true})
  await panel().getByRole('textbox',{name:'Editable files (one per line)',exact:true}).fill('workbench/schemas.py')
  await panel().getByRole('button',{name:'Review sources & test environment',exact:true}).click()
  await panel().getByRole('checkbox').waitFor()
  assert.equal((await api('/bootstrap')).data.runs.length,0)
  check('Task opens an exact source/model/test review with no Run or model call')

  const preparePath=`/api/tasks/${task.id}/coding/prepare`
  let requestId
  await page.route(`**${preparePath}`,async route=>{
    const response=await route.fetch();assert.equal(response.status(),200)
    requestId=(await response.json()).request_id;await route.abort('failed')
  })
  await panel().getByRole('checkbox').check()
  await panel().getByRole('button',{name:'Confirm implementation & tests',exact:true}).click()
  await page.getByText('The outcome is unknown. Keep and check the original request ID; do not repeat execution.',{exact:true}).waitFor()
  await page.unroute(`**${preparePath}`)
  assert.equal((await api('/bootstrap')).data.runs.length,0)
  assert.ok(page.url().includes(`codingRequest=${requestId}`))
  await page.reload()
  await panel().getByRole('button',{name:'Discard this preparation',exact:true}).waitFor()
  assert.equal(await panel().getByRole('checkbox').isChecked(),false)
  assert.equal(report.writes.filter(write=>write.path===preparePath).length,1)
  check('Lost preparation survives reload by original GET with unchecked execution consent and no duplicate preparation')

  for(const style of ['neutral','zira','y2k'])for(const mode of ['light','dark']){
    const locale=mode==='dark'?'zh':'en',width=mode==='dark'?390:1440
    await page.evaluate(({style,mode,locale})=>{localStorage.setItem('mybot.style',style);localStorage.setItem('mybot.mode',mode);localStorage.setItem('mybot.locale',locale)},{style,mode,locale})
    await page.setViewportSize({width,height:1000});await page.reload()
    await page.getByRole('button',{name:locale==='zh'?'放弃此次准备':'Discard this preparation',exact:true}).waitFor()
    const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
    assert.ok(geometry.scroll<=geometry.width+1);report.geometry.push({surface:'candidate',style,mode,locale,...geometry})
    const file=`candidate-${style}-${mode}.png`;await capture(file);report.screenshots.push(file)
  }
  check('Prepared candidate renders in three styles, both modes, desktop English and mobile Chinese')
  await page.evaluate(()=>localStorage.setItem('mybot.locale','en'));await page.reload()
  const executePath=`/api/tasks/${task.id}/coding/${requestId}/execute`
  await page.route(`**${executePath}`,async route=>{
    const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed')
  })
  await panel().getByRole('checkbox').check()
  await panel().getByRole('button',{name:'Confirm implementation & tests',exact:true}).click()
  await page.getByText('The outcome is unknown. Keep and check the original request ID; do not repeat execution.',{exact:true}).waitFor()
  await page.unroute(`**${executePath}`);await page.reload()
  await page.waitForFunction(()=>!location.hash.includes('codingRequest=')&&location.hash.includes('taskRun='))
  let detail
  await poll(async()=>{
    const runs=(await api('/bootstrap')).data.runs
    assert.equal(runs.length,1)
    detail=(await api(`/runs/${runs[0].id}`)).data
    return ['succeeded','failed'].includes(detail.run.status)
  },'implementation and actual unittest completion')
  assert.equal(detail.run.status,'succeeded',detail.run.error)
  assert.equal(detail.calls.length,2)
  const tests=detail.artifacts.filter(item=>item.kind==='test_result').map(item=>JSON.parse(item.content)).sort((a,b)=>a.round-b.round)
  assert.deepEqual(tests.map(test=>test.passed),[false,false,true])
  assert.deepEqual(tests.map(test=>test.tests_run),[4,4,4])
  assert.deepEqual(tests.map(test=>test.receipt.failures),[2,1,0])
  report.actual={task_id:task.id,run_id:detail.run.id,status:detail.run.status,
    model_calls:detail.calls.length,test_attempts:tests.map(test=>({
      round:test.round,tests_run:test.tests_run,exit_code:test.exit_code,
      failures:test.receipt.failures,errors:test.receipt.errors,passed:test.passed,
    }))}
  await writeFile(resolve(out,'actual-test-attempts.json'),JSON.stringify(tests,null,2))
  assert.equal(report.writes.filter(write=>write.path===executePath).length,1)
  check('Real mybot path validation runs fail → partial fix/fail → complete fix/pass, with one execution POST and two bounded model responses')
  assert.equal(await readFile(resolve(fixture,'workspace/workbench/schemas.py'),'utf8'),original)
  assert.equal(await readFile(resolve(fixture,'workspace/test_relative_path.py'),'utf8'),immutable)
  check('Original source and immutable tests stay byte-for-byte unchanged')
  await page.reload()
  await page.getByTestId('run-test-state').getByText('Passed',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Pause',exact:true}).count(),0)
  assert.equal(await page.getByRole('button',{name:'Retry & resources',exact:true}).count(),0)
  assert.equal((await api(`/runs/${detail.run.id}/retry-preview`)).status,409)
  check('Run shows actual test success and does not expose incompatible research pause/resume/retry controls')
  const diff=detail.artifacts.find(item=>item.kind==='diff'&&item.title.endsWith('2'))
  await page.setViewportSize({width:1440,height:1000})
  await page.getByRole('button',{name:'Work graph',exact:true}).click()
  const graph=page.getByRole('region',{name:'Run work graph',exact:true})
  await graph.getByRole('heading',{name:'Test verification · 2',exact:true}).waitFor()
  assert.equal(await graph.locator('.wb-graph-member').count(),1)
  await graph.locator('.wb-graph-rail').getByRole('button',{name:/Implementation · 1/}).click()
  await graph.getByRole('heading',{name:'Implementation · 1',exact:true}).waitFor()
  assert.equal(await graph.locator('.wb-graph-member').count(),1)
  const graphShot='graph-implementation-desktop.png'
  await capture(graphShot);report.screenshots.push(graphShot)
  check('Work graph binds actual implementation and test stages to their real Agents and artifacts')
  await page.getByRole('button',{name:/^Artifacts \d+$/}).click()
  await page.getByRole('combobox',{name:'Select artifact',exact:true}).click()
  await page.getByRole('option',{name:diff.title,exact:true}).click()
  await page.getByTestId('coding-diff').waitFor()
  assert.match(await page.getByTestId('coding-diff').innerText(),/any\(ord\(char\) < 32/)
  const download=page.waitForEvent('download')
  await page.getByRole('button',{name:'Download artifact',exact:true}).click()
  const saved=await download
  assert.match(saved.suggestedFilename(),/\.patch$/)
  const patchPath=await saved.path()
  assert.equal(await readFile(patchPath,'utf8'),diff.content)
  execFileSync('git',['apply','--check',patchPath],{cwd:resolve(fixture,'workspace'),env:{
    PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_SYSTEM:'/dev/null',
  }})
  await writeFile(resolve(out,'actual.patch'),diff.content)
  check('Actual source Diff is readable and exports as a patch')
  const patchShot='actual-patch-desktop.png'
  await capture(patchShot);report.screenshots.push(patchShot)
  const testArtifact=detail.artifacts.find(item=>item.kind==='test_result'&&JSON.parse(item.content).round===2)
  await page.getByRole('combobox',{name:'Select artifact',exact:true}).click()
  await page.getByRole('option',{name:testArtifact.title,exact:true}).click()
  await page.getByTestId('coding-test-output').waitFor()
  assert.match(await page.getByTestId('coding-test-output').innerText(),/Ran 4 tests/)
  const testDownload=page.waitForEvent('download')
  await page.getByRole('button',{name:'Download artifact',exact:true}).click()
  const testSaved=await testDownload
  assert.match(testSaved.suggestedFilename(),/\.json$/)
  assert.equal(await readFile(await testSaved.path(),'utf8'),testArtifact.content)
  const testShot='actual-tests-desktop.png'
  await capture(testShot);report.screenshots.push(testShot)
  check('Actual test output, command arguments and exit evidence display and export as the original JSON')
  for(const style of ['neutral','zira','y2k'])for(const mode of ['light','dark']){
    const locale=mode==='dark'?'zh':'en',width=mode==='dark'?390:1440
    await page.evaluate(({style,mode,locale})=>{localStorage.setItem('mybot.style',style);localStorage.setItem('mybot.mode',mode);localStorage.setItem('mybot.locale',locale)},{style,mode,locale})
    await page.setViewportSize({width,height:1000});await page.reload()
    await page.getByTestId('run-test-state').getByText(locale==='zh'?'通过':'Passed',{exact:true}).waitFor()
    const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
    assert.ok(geometry.scroll<=geometry.width+1);report.geometry.push({surface:'result',style,mode,locale,...geometry})
    const file=`result-${style}-${mode}.png`;await capture(file);report.screenshots.push(file)
  }
  check('Real Run, implementation attempts, test states and artifacts render across all six style/mode layouts')
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[])
}catch(reason){
  report.failure=String(reason)
  await page.screenshot({path:resolve(out,'failure.png'),fullPage:true}).catch(()=>{})
  throw reason
}finally{
  await writeFile(resolve(out,'verification.json'),JSON.stringify(report,null,2))
  await browser.close()
}
