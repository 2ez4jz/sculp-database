// JSON schemas constrain the model; validate again before the database boundary.
export function validateBookingQuery(args){
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!['bookingId','query','offset'].includes(k)))throw Error('Invalid query');
 if(args.bookingId!==null&&(typeof args.bookingId!=='string'||!args.bookingId||args.bookingId.length>100))throw Error('Invalid booking ID');
 if(typeof args.query!=='string'||args.query.length>200||!Number.isSafeInteger(args.offset)||args.offset<0||args.offset>100000)throw Error('Invalid query window');
 return {bookingId:args.bookingId,query:args.query,offset:args.offset};
}
export async function readBoundedJSON(req,maxBytes=180000){
 const reader=req.body?.getReader();if(!reader)throw Object.assign(Error('请求为空。'),{status:400});
 let size=0,parts=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw Object.assign(Error('本次内容太多，请分段发送。'),{status:413});}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 let result;try{result=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(Error('请求格式无效。'),{status:400});}
 if(!result||typeof result!=='object'||Array.isArray(result))throw Object.assign(Error('请求格式无效。'),{status:400});return result;
}
