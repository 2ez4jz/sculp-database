export const importFields={
 clients:[['external_id','来源编号'],['display_name','客户姓名'],['preferred_name','称呼'],['phone','电话'],['email','邮箱'],['wechat','微信'],['instagram','Instagram'],['referral_source','客户来源'],['city','城市'],['preferred_language','语言'],['wedding_date','婚礼日期'],['tags','标签（分号分隔）'],['internal_notes','内部备注']],
 orders:[['external_id','来源编号'],['client_choice','客户 ID（可选）'],['client_name','客户姓名'],['client_email','客户邮箱'],['client_phone','客户电话'],['service','服务代码'],['service_date','服务日期'],['start_time','开始时间（多伦多）'],['utc_offset','时区偏移（可选）'],['starts_at','完整开始时间（可选）'],['ends_at','完整结束时间（可选）'],['status','订单状态'],['currency','币种'],['price','成交价'],['budget','预算'],['details','服务需求'],['order_number','原系统单号（可选）']],
};
export const csvTemplate=kind=>'\ufeff'+importFields[kind].map(x=>x[0]).join(',')+'\r\n';
// Bounded RFC 4180 parser: quoted commas/newlines, escaped quotes and BOM.
// Values remain strings; spreadsheet formulas are never evaluated.
export function parseCsv(input){
 if(typeof input!=='string'||input.length>2097152)throw Error('文件过大，最多 2 MiB。');
 const text=input.replace(/^\ufeff/,''),records=[];let record=[],field='',quoted=false,closed=false,line=1,startLine=1;
 const pushRecord=()=>{record.push(field);if(record.length>50)throw Error('CSV 最多支持 50 列。');if(record.some(x=>x!==''))records.push({line:startLine,record});record=[];field='';closed=false;if(records.length>2001)throw Error('单个文件最多 2000 行，请拆分文件。');};
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){
   if(ch==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}
   else{field+=ch;if(ch==='\n')line++;}
  }else if(ch===','){record.push(field);field='';closed=false;}
  else if(ch==='\n'||ch==='\r'){
   if(ch==='\r'&&text[i+1]==='\n')i++;pushRecord();line++;startLine=line;
  }else if(closed){if(ch!==' '&&ch!=='\t')throw Error('第 '+line+' 行的引号后有多余内容。');}
  else if(ch==='"'){if(field!=='')throw Error('第 '+line+' 行引号格式无效。');quoted=true;}
  else field+=ch;
  if(field.length>16000||record.length>50)throw Error('第 '+line+' 行内容过长。');
 }
 if(quoted)throw Error('CSV 引号未闭合。');if(field!==''||record.length||closed)pushRecord();
 if(records.length<2)throw Error('CSV 需要标题行和至少一行数据。');
 const headers=records.shift().record.map(x=>x.trim());
 if(headers.some(x=>!x||x.length>160)||new Set(headers.map(x=>x.toLowerCase())).size!==headers.length)throw Error('标题不能为空或重复。');
 return {headers,rows:records.map(row=>{if(row.record.length!==headers.length)throw Error('第 '+row.line+' 行列数与标题不一致。');return {line:row.line,values:Object.fromEntries(headers.map((h,i)=>[h,row.record[i]]))};})};
}
export function mapImportRows(csv,kind,mapping,start=0,end=100){
 if(!importFields[kind])throw Error('导入类型无效。');
 return csv.rows.slice(start,end).map(row=>{
  const mapped={line:row.line};
  for(const [key] of importFields[kind])if(mapping[key])mapped[key]=String(row.values[mapping[key]]??'').trim();
  return mapped;
 });
}
