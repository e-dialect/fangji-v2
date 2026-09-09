import assert from 'node:assert/strict'
const base=process.env.PB_URL
async function api(path,{method='GET',token='',body,status=200}={}) {
 const form=body instanceof FormData
 const r=await fetch(base+path,{method,headers:{Authorization:token,...(!form&&body?{'Content-Type':'application/json'}:{})},body:body?form?body:JSON.stringify(body):undefined})
 const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data
}
const admin=await api('/api/collections/users/auth-with-password',{method:'POST',body:{identity:process.env.APP_ADMIN_EMAIL,password:process.env.APP_ADMIN_PASSWORD}})
const token=admin.token
const project=await api('/api/fangji/projects',{method:'POST',token,body:{name:'Column order fixture'},status:201})
const form=new FormData();form.set('file',new Blob(['词条,10,PDF页码,释义,2\n𢶀,十,1,意思,二\n']), 'order.csv');form.set('inspect_only','true')
const job=await api(`/api/fangji/projects/${project.id}/imports/csv`,{method:'POST',token,body:form,status:202})
async function wait(status) {for(let i=0;i<100;i++){const j=await api(`/api/collections/import_jobs/records/${job.id}`,{token});if(j.status===status)return j;assert.notEqual(j.status,'failed',JSON.stringify(j));await new Promise(r=>setTimeout(r,100))}throw Error('import timeout')}
const inspected=await wait('validated');assert.deepEqual(JSON.parse(inspected.inspection_json).headers,['词条','10','PDF页码','释义','2'])
await api(`/api/fangji/imports/${job.id}/commit`,{method:'POST',token,status:202});await wait('completed')
const pages=await api(`/api/collections/pages/records?filter=${encodeURIComponent(`project="${project.id}"`)}`,{token})
const page=pages.items[0];assert.deepEqual(JSON.parse(page.row_headers_json),['词条','10','释义','2']);assert.equal(page.ocr_text,'𢶀 十 意思 二')
const user=await api('/api/collections/users/records',{method:'POST',body:{email:'order-reader@example.com',name:'reader',role:'user',password:'OrderTest12345!',passwordConfirm:'OrderTest12345!'}})
const auth=await api('/api/collections/users/auth-with-password',{method:'POST',body:{identity:'order-reader@example.com',password:'OrderTest12345!'}})
await api(`/api/fangji/projects/${project.id}/members/${user.id}`,{method:'PUT',token,body:{role:'proofreader'}})
await api(`/api/fangji/projects/${project.id}/claim`,{method:'POST',token:auth.token})
const task=await api(`/api/fangji/pages/${page.id}/task`,{token:auth.token});assert.deepEqual(JSON.parse(task.row_headers_json),['词条','10','释义','2'])
console.log('PASS: real CSV upload, inspection, import, storage and claimed task preserve source column order')
if(process.env.COLUMN_BROWSER_FIXTURE){
 const superAuth=await api('/api/collections/_superusers/auth-with-password',{method:'POST',body:{identity:process.env.PB_SUPER_EMAIL,password:process.env.PB_SUPER_PASSWORD}})
 await api(`/api/collections/users/records/${admin.record.id}`,{method:'PATCH',token:superAuth.token,body:{must_change_password:false}});admin.record.must_change_password=false
 const {writeFile}=await import('node:fs/promises');await writeFile(process.env.COLUMN_BROWSER_FIXTURE,JSON.stringify({base,auth,admin,project,page}))
 const {spawnSync}=await import('node:child_process');assert.equal(spawnSync('node',[process.env.COLUMN_BROWSER_SCRIPT],{stdio:'inherit',env:process.env}).status,0)
}
