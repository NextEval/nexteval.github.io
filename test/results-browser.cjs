const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');

async function main() {
  const root=path.resolve(__dirname,'..');
  const output=process.env.SITE_TEST_ARTIFACTS || await fs.mkdtemp(path.join(os.tmpdir(),'nexteval-results-'));
  await fs.mkdir(output,{recursive:true});
  const dataRoot=process.env.RESULTS_DATA_DIRECTORY || path.join(root,'bench/results/data');
  const data=JSON.parse(await fs.readFile(path.join(dataRoot,'results.json'),'utf8'));
  const {relativeScore,referenceScore}=await import('../bench/results/scores.mjs');
  const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.gz':'application/gzip'};
  const server=http.createServer(async(req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const isData=pathname.startsWith('/bench/results/data/');
    const allowedRoot=isData ? path.resolve(dataRoot) : root;
    const file=isData ? path.resolve(dataRoot,pathname.slice('/bench/results/data/'.length)) : path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(allowedRoot+path.sep)){res.writeHead(403).end();return;}
    try{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}
  });
  let browser;
  const faults=[];
  const screenshots=[];
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    browser=await chromium.launch({headless:true,channel:process.env.SITE_BROWSER_CHANNEL||'chrome'});
    const page=await browser.newPage();
    page.on('pageerror',error=>faults.push(error.message));
    page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400)faults.push(`${response.status()} ${response.url()}`);});
    async function layout(name,width) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${name} page overflow ${width}`);
      const small=await page.evaluate(()=>{
        const issues=[],walker=document.createTreeWalker(document.getElementById('results-app'),NodeFilter.SHOW_TEXT);
        while(walker.nextNode()){
          const text=walker.currentNode,el=text.parentElement;
          if(!text.textContent.trim()||!el.checkVisibility()||el.closest('sup,svg,caption'))continue;
          if(parseFloat(getComputedStyle(el).fontSize)<14)issues.push(text.textContent.trim().slice(0,80));
        }
        return issues;
      });
      assert.deepEqual(small,[],`${name}: unreadably small text`);
      const file=`${name}-${width}.png`;
      await page.screenshot({path:path.join(output,file),fullPage:true});screenshots.push(file);
    }
    await page.goto(base+'/bench/',{waitUntil:'networkidle'});
    await page.locator('.results-matrix').waitFor();
    assert.equal(await page.locator('h1').innerText(),'Task matrix');
    assert.equal(await page.locator('.task-column').count(),4);
    assert.equal(await page.locator('.task-column svg').count(),4,'All feature symbols render');
    for(const width of [320,390,768,1280,1440])await layout('matrix',width);
    for(const task of data.tasks.filter(t=>t.scores.length)) {
      await page.selectOption('#sort-task',task.task_id);
      await page.waitForFunction(id=>document.querySelector('#sort-task')?.value===id,task.task_id);
      const ids=await page.locator('.results-matrix tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('a')].map(a=>a.getAttribute('aria-label'))));
      const expected=[...task.scores].sort((a,b)=>b.score-a.score||data.participants.find(p=>p.participant_id===a.participant_id).label.localeCompare(data.participants.find(p=>p.participant_id===b.participant_id).label));
      const baseline=referenceScore(task);
      for(let i=0;i<expected.length;i++) {
        const participant=data.participants.find(p=>p.participant_id===expected[i].participant_id);
        const displayScore=relativeScore(expected[i].score,baseline).toFixed(2);
        assert(ids[i]?.includes(`${participant.label}, ${task.label}, COBYQA-relative score ${displayScore}`),
          `Sort by exported task score: ${task.task_id} row ${i}, expected ${participant.label} ${displayScore}, got ${JSON.stringify(ids[i])}`);
      }
      await page.locator(`[data-task="${task.task_id}"]`).click();
      await page.locator('#profile-chart svg[role="img"]').waitFor();
      const taskLocation=page.url();
      await page.locator('.results-skip').focus();
      await page.keyboard.press('Enter');
      assert.equal(page.url(),taskLocation,'Skip link must not reset task navigation');
      for(const width of [390,1440])await layout('performance-'+task.task_id,width);
      await page.selectOption('#tolerance','0.1');
      await page.waitForFunction(()=>document.querySelector('#profile-chart svg title')?.textContent.includes('0.1'));
      const before=await page.locator('#profile-chart svg[role="img"] path').count();
      await page.locator('#profile-chart .series-key').first().click();
      assert((await page.locator('#profile-chart svg[role="img"] path').count())<before);
      await page.getByRole('navigation',{name:'Task views'}).getByRole('link',{name:'Data',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.chart-axis')?.textContent.includes('dimension + 1'));
      assert.match(await page.locator('.chart-axis').innerText(),/dimension \+ 1/);
      await layout('data-'+task.task_id,1440);
      await page.getByRole('navigation',{name:'Task views'}).getByRole('link',{name:'Histories',exact:true}).click();
      await page.locator('#history-chart svg[role="img"]').waitFor();
      assert.equal(await page.locator('#history-problem option').count(),task.grid.problems);
      assert.equal(await page.locator('#history-repeat option').count(),task.grid.repetitions);
      for(const width of [390,1440])await layout('history-'+task.task_id,width);
      await page.selectOption('#history-repeat','9');
      await page.locator('#history-chart svg[role="img"]').waitFor();
      await page.locator('.back-link').first().click();
      await page.locator('.results-matrix').waitFor();
    }
    await page.goto(base+'/bench/#profiles',{waitUntil:'networkidle'});
    await page.waitForURL(/archive\.html#profiles/);
    assert.match(page.url(),/archive\.html#profiles/);
    await page.locator('#profiles').waitFor();
    assert.deepEqual(faults,[]);
    await fs.writeFile(path.join(output,'qa.json'),JSON.stringify({snapshot:data.snapshot_id,screenshots,faults},null,2));
    console.log(JSON.stringify({output,snapshot:data.snapshot_id,screenshots:screenshots.length,faults},null,2));
  } finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
