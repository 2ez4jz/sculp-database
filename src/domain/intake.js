// AI output is untrusted. Only supported, bounded draft fields reach the UI.
export const serviceTypes = ['Wedding', 'Trial', 'Event', 'Photoshoot', 'Commercial', 'Education'];
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
export function normalizeEntityProposals(result) {
  return (Array.isArray(result?.entities) ? result.entities : []).slice(0, 6)
    .filter(x => x && ['client', 'booking'].includes(x.type))
    .map(x => Object.fromEntries(['type', 'name', 'city', 'date', 'service', 'artist', 'venue', 'evidence'].map(k =>
      [k, typeof x[k] === 'string' ? x[k].trim().slice(0, k === 'evidence' ? 1000 : 100) : ''])))
    .map(x => ({ ...x, date: validDate(x.date) ? x.date : '', service: serviceTypes.includes(x.service) ? x.service : '' }));
}
export function uniqueNameId(records, name) {
  const normalized = String(name || '').trim().toLocaleLowerCase();
  const matches = records.filter(x => x.name.trim().toLocaleLowerCase() === normalized);
  return normalized && matches.length === 1 ? matches[0].id : '';
}
export function validateNewEntity(type, fields, data) {
  if (type === 'client') {
    const name = fields.name.trim();
    if (name.length < 2 || name.length > 100) throw Error('请输入客户姓名（2–100 字）。');
    if (data.clients.some(c => c.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error('已有同名客户，请先核对后再创建。');
    return { name, city: fields.city.trim(), email:'', phone:'', wechat:'', instagram:'', birthday:'', weddingDate:'', referral:'', preferences:[], opportunity:'' };
  }
  if (type !== 'booking') throw Error('不支持的记录类型。');
  if (!data.clients.some(c => c.id === fields.clientId) || !validDate(fields.date)) throw Error('请选择有效客户和服务日期。');
  if (!data.artists.some(a => a.id === fields.artistId && a.bookingEligible !== false) || !data.venues.some(v => v.id === fields.venueId)) throw Error('请选择负责人和场地，未识别的信息需要人工补齐。');
  if (!serviceTypes.includes(fields.service)) throw Error('请选择服务类型。');
  if (data.bookings.some(b => b.clientId === fields.clientId && b.date === fields.date && b.service === fields.service)) throw Error('这位客户当天已有同类订单，请先核对，避免重复建单。');
  return { date:fields.date, clientId:fields.clientId, artistIds:[fields.artistId], venueId:fields.venueId, service:fields.service, startTime:'10:00', endTime:'12:00', partnerIds:[], price:0, status:'Inquiry', needsReview:true };
}
