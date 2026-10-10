const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
  try {
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
    await page.goto('http://localhost:4173/');
    await page.locator('#login-form').waitFor();
    await page.evaluate(async()=>{
      document.body.innerHTML='<main class="auth-card" id="test-root"></main>';
      const {mountOrderEditor}=await import('/src/pages/login/order-editor.js');
      window.calls=[];window.loseResponse=true;window.editVersion=1;
      window.base={version:1,date:'2026-11-15',time:'07:00',endDate:'',endTime:'',location:'Toronto',details:'Wedding',status:'inquiry'};
      window.rpc={rpc:async(name,args)=>{
        window.calls.push(args);
        if(window.conflict)return {error:{code:'40001',message:'Changed elsewhere'}};
        window.editVersion=2;
        if(window.loseResponse){window.loseResponse=false;throw Error('Network response lost');}
        return {data:{bookingId:'order1',version:2}};
      }};
      window.editor=mountOrderEditor({root:document.querySelector('#test-root'),supabase:window.rpc,bookingId:'order1',edit:window.base,onSaved:async id=>{window.reloaded=id;}});
    });
    await page.locator('summary').click();
    await page.locator('[name=location]').fill('Markham <script>unsafe</script>');
    await page.locator('[name=reason]').fill('  客户原话\n修改地点  ');
    await page.getByRole('button',{name:'核对修改',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.calls.length),0);
    assert.equal(await page.locator('[data-change-review] script').count(),0);
    await page.getByRole('button',{name:'取消本次修改'}).click();
    assert.equal(await page.evaluate(()=>window.calls.length),0);
    await page.getByRole('button',{name:'核对修改',exact:true}).click();
    await page.locator('[name=details]').fill('Wedding + mother');
    assert.equal(await page.locator('[data-confirm-change]').count(),0);
    await page.getByRole('button',{name:'核对修改',exact:true}).click();
    await page.getByRole('button',{name:'确认保存修改'}).click();
    await page.getByRole('button',{name:'重试同一笔修改'}).waitFor();
    assert.equal(await page.locator('[name=location]').isDisabled(),true);
    assert.equal(await page.evaluate(()=>window.editor.canLeave()),false);
    await page.getByRole('button',{name:'重试同一笔修改'}).click();
    await page.getByText('修改已保存，其他设备可重新读取。').waitFor();
    const result=await page.evaluate(()=>({calls:window.calls,reloaded:window.reloaded,canLeave:window.editor.canLeave()}));
    assert.equal(result.calls.length,2);assert.deepEqual(result.calls[0],result.calls[1]);
    assert.equal(result.calls[0].p_expected_version,1);assert.equal(result.calls[0].p_reason,'  客户原话\n修改地点  ');
    assert.equal(result.reloaded,'order1');assert.equal(result.canLeave,true);
    await page.evaluate(async()=>{
      window.editor.destroy();window.conflict=true;window.calls=[];
      const {mountOrderEditor}=await import('/src/pages/login/order-editor.js');
      window.editor=mountOrderEditor({root:document.querySelector('#test-root'),supabase:window.rpc,bookingId:'order1',edit:window.base,onSaved:async()=>{throw Error('Conflict must not refresh as success');}});
    });
    await page.locator('summary').click();await page.locator('[name=location]').fill('Changed');await page.locator('[name=reason]').fill('Conflict test');
    await page.getByRole('button',{name:'核对修改',exact:true}).click();await page.locator('[data-confirm-change]').click();
    await page.getByText(/另一窗口已修改订单/).waitFor();
    assert.equal(await page.locator('[data-confirm-change]').count(),0);assert.equal(await page.evaluate(()=>window.calls.length),1);
    assert.equal(await page.evaluate(()=>window.editor.canLeave()),true);
    await page.evaluate(async()=>{
      window.editor.destroy();
      const {mountMonthlyReport}=await import('/src/pages/login/monthly-report.js');
      window.reportCalls=[];window.slow=false;
      window.report=mountMonthlyReport({root:document.querySelector('#test-root'),supabase:{rpc:async(name,args)=>{
        window.reportCalls.push({name,args});
        if(window.reportDenied)return {error:{code:'42501',message:'仅管理员可查看经营月报。'}};
        if(window.slow)await new Promise(resolve=>{window.resolveReport=resolve;});
        return {data:{month:args.p_month,asOf:'2026-10-09T15:00:00Z',timezone:'America/Toronto',
          bookings:{total:3,inquiry:1,confirmed:1,completed:1,cancelled:0,completedAmountCents:'100030',unpriced:1,nonCadCompleted:0},
          receipts:{grossAmountCents:'50000',refundReviewCount:1,nonCadCount:0},undatedReceiptCount:2}};
      }}});
    });
    await page.locator('summary').click();await page.locator('[name=month]').fill('2026-09');await page.getByRole('button',{name:'查询月报'}).click();
    await page.getByText('CAD 1,000.30',{exact:true}).waitFor();await page.getByText('CAD 500.00',{exact:true}).waitFor();
    assert.match(await page.locator('[data-report-warnings]').innerText(),/退款需核对：1/);
    await page.evaluate(()=>{window.slow=true;});await page.getByRole('button',{name:'查询月报'}).click();
    await page.waitForFunction(()=>Boolean(window.resolveReport));await page.locator('[name=month]').fill('2026-10');
    await page.evaluate(()=>{window.resolveReport();});await page.waitForTimeout(50);
    assert.equal(await page.locator('[data-report-result] h4').count(),0);
    await page.evaluate(()=>{window.slow=false;window.reportDenied=true;});await page.getByRole('button',{name:'查询月报'}).click();
    await page.getByText('仅管理员可查看经营月报。').waitFor();assert.equal(await page.locator('[data-report-result] h4').count(),0);
    // Actual workspace only mounts editor and reporting for business administrators.
    await page.evaluate(async()=>{
      window.report.destroy();
      const {mountCloudWorkspace}=await import('/src/pages/login/workspace.js');
      window.workspace=mountCloudWorkspace({root:document.querySelector('#test-root'),profile:{id:'staff',role:'artist'},
        supabase:{rpc:async()=>({data:{bookings:[],total:0}})}});
    });
    assert.equal(await page.getByText('云端经营月报',{exact:true}).count(),0);
    assert.equal(await page.getByText('录入新订单',{exact:true}).count(),0);
    await page.evaluate(async()=>{
      window.workspace.destroy();window.workspaceCalls=[];
      const {mountCloudWorkspace}=await import('/src/pages/login/workspace.js');
      const booking={id:'order1',client:'QA Client',service:'Wedding',starts_at:'2026-11-15T12:00:00Z',artists:[],venue:'Toronto',status:'inquiry'};
      window.workspace=mountCloudWorkspace({root:document.querySelector('#test-root'),profile:{id:'owner',role:'owner'},
        supabase:{rpc:async(name,args)=>{
          if(name==='sculpy_confirm_booking_change'){window.workspaceCalls.push(args);booking.venue=args.p_payload.location;return {data:{bookingId:'order1'}};}
          return {data:{bookings:[booking],total:1,edit:name==='sculpy_order_detail'?{...window.base,version:window.workspaceCalls.length+1,location:booking.venue}:undefined}};
        },from:()=>({select:()=>({eq:()=>({single:async()=>({data:{content:''}})})})})}});
    });
    await page.locator('[data-booking=order1]').click();await page.locator('[data-order-detail]').getByText('修改订单',{exact:true}).click();
    await page.locator('[data-edit-form] [name=location]').fill('Richmond Hill');await page.locator('[data-edit-form] [name=reason]').fill('Workspace integration');
    await page.getByRole('button',{name:'核对修改',exact:true}).click();await page.locator('[data-confirm-change]').click();
    await page.locator('[data-order-detail]').getByText(/Richmond Hill ·/).waitFor();
    assert.equal(await page.evaluate(()=>window.workspaceCalls.length),1);
    await page.locator('[data-order-detail]').getByText('修改订单',{exact:true}).click();
    assert.equal(await page.locator('[data-edit-form] [name=location]').inputValue(),'Richmond Hill');
    await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'qa-screens/cloud-operations-mobile.png',fullPage:true});
    await page.evaluate(()=>window.workspace.destroy());assert.deepEqual(errors,[]);
    console.log('Cloud operations UI passed: review/cancel, source fidelity, lost-response replay, conflict, report semantics, stale response, role boundary and mobile.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
