export const DEFAULT_CHANNELS = [
  {id:"instagram",name:"Instagram",category:"社交媒体"},
  {id:"xiaohongshu",name:"小红书",category:"社交媒体"},
  {id:"google",name:"Google 搜索",category:"搜索"},
  {id:"website",name:"官网咨询",category:"官网"},
  {id:"referral",name:"客户转介绍",category:"转介绍"},
  {id:"planner",name:"Planner / 合作方",category:"合作伙伴"},
  {id:"other",name:"其他",category:"其他"}
];
export function channelCatalog(state) {
  return [...DEFAULT_CHANNELS, ...(state.extraChannels || [])].filter(x=>!(state.disabledChannels||[]).includes(x.id));
}
export function channelForBooking(booking,state) {
  return (state.channelAssignments||{})[booking.id] || booking.channelId || null;
}
export function channelSummary(bookings,state) {
  const catalog=channelCatalog(state);
  return [...catalog.map(c=>({
    ...c,
    count:bookings.filter(b=>channelForBooking(b,state)===c.id).length
  })), {id:null,name:"未填写",category:"未分类",count:bookings.filter(b=>!channelForBooking(b,state)).length}];
}
export function validChannelName(name) {
  return typeof name==="string" && name.trim().length>=2 && name.trim().length<=60;
}
