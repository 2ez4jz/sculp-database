// Public references only; internal IDs and permission checks remain independent.
export const serviceNumberCodes = Object.freeze({
  Wedding:'1', Trial:'2', Event:'3', Photoshoot:'5', Commercial:'6', Education:'7', Personal:'8',
});
export const orderNumberPattern = /^6[01235678][012356789]{4}$/;
const digits='012356789', capacity=9**4;
function secureRandom() {
  return crypto.getRandomValues(new Uint32Array(1))[0]/2**32;
}
export function allocateOrderNumber(service, used, random=secureRandom) {
  const occupied=new Set([...used].map(String));
  const prefix='6'+(serviceNumberCodes[service]||'0');
  const start=Math.floor(random()*capacity);
  for(let offset=0;offset<capacity;offset++) {
    let value=(start+offset)%capacity, suffix='';
    for(let i=0;i<4;i++){suffix=digits[value%9]+suffix;value=Math.floor(value/9);}
    const number=prefix+suffix;
    if(!occupied.has(number))return number;
  }
  throw Error('这类服务的六位单号已用完，请联系管理员扩展编号。');
}
