export const artists = [
 {id:'miranda',name:'Miranda',level:'Signature Artist / Founder',systemRole:'owner',accountStatus:'pilot',image:'https://2ez4jz.github.io/sculpstudio/assets/images/miranda-portrait.webp',specialties:['Editorial','Luxury Bridal','Destination'],bio:'十年以上时尚、名人造型与高端婚礼经验，以编辑视角完成现代新娘造型。'},
 {id:'yuki',name:'Yuki',level:'Director Artist',systemRole:'artist',accountStatus:'profile_only',image:'https://2ez4jz.github.io/sculpstudio/assets/images/yuki-portrait.webp',specialties:['Bridal','Education','Technical'],bio:'拥有十年以上婚礼造型经验，结合专业技术、教学背景与精致的艺术表达。'},
 {id:'mira',name:'Mira',level:'Director Artist',systemRole:'artist',accountStatus:'profile_only',image:'https://2ez4jz.github.io/sculpstudio/assets/images/mira-portrait.webp',specialties:['Modern Bridal','New Chinese Style'],bio:'专注现代婚礼与新中式造型，把东方审美与当代技术结合。'},
 {id:'michelle',name:'Michelle',level:'Senior Artist',systemRole:'artist',accountStatus:'profile_only',image:'https://2ez4jz.github.io/sculpstudio/assets/images/michelle-portrait.webp',specialties:['Refined','Balanced','Personalized'],bio:'以平衡、细致的方式围绕客户本身的五官、风格与场合完成造型。'},
 {id:'emily',name:'Emily',level:'Senior Artist',systemRole:'artist',accountStatus:'profile_only',image:'https://2ez4jz.github.io/sculpstudio/assets/images/emily-portrait.webp',specialties:['Fresh','Polished','Personalized'],bio:'以清新、精致和个性化为重点，细致回应客户的五官与场合。'},
 {id:'angelina',name:'Angelina',level:'Senior Artist',systemRole:'artist',accountStatus:'profile_only',image:'https://2ez4jz.github.io/sculpstudio/assets/images/angelina-portrait.webp',specialties:['Korean-inspired','Bridal','Editorial'],bio:'擅长现代韩系婚礼、编辑与商业造型，妆感清新并适合镜头呈现。'},
 {id:'elaine',name:'Elaine',level:'Senior Artist',systemRole:'artist',accountStatus:'profile_only',image:'https://2ez4jz.github.io/sculpstudio/assets/images/elaine-portrait.webp',specialties:['Bridal','Portrait','Event'],bio:'以柔和、现代的方式完成婚礼、人像与活动造型，保留客户自身特点。'},
 {id:'giselle',name:'Giselle',level:'Senior Artist',systemRole:'artist',accountStatus:'profile_only',image:'https://2ez4jz.github.io/sculpstudio/assets/images/giselle-portrait.webp',specialties:['Soft Glam','Western','Thai-inspired'],bio:'擅长 Soft Glam、现代西式与泰式灵感妆面，强调光泽肌肤与立体轮廓。'},
 {id:'jz',name:'Jz',level:'Operations & Product / Administrator',systemRole:'operations',accountStatus:'pilot',image:null,bookingEligible:false,specialties:['Operations','Product','Data'],bio:'负责工作室运营系统、数据结构、流程设计与产品迭代，帮助团队把经验转化为可持续积累。'}
];
export const venues=[
 {id:'graydon',name:'Graydon Hall Manor',address:'185 Graydon Hall Dr, Toronto',website:'https://www.graydonhall.com',note:'新娘准备房自然光充足；预留设备布置时间。'},
 {id:'four-seasons',name:'Four Seasons Toronto',address:'60 Yorkville Ave, Toronto',website:'https://www.fourseasons.com/toronto/',note:'提前与前台确认上楼与停车安排。'},
 {id:'casa',name:'Casa Loma',address:'1 Austin Terrace, Toronto',website:'https://casaloma.ca',note:'建筑内动线较长，提前确认准备房位置。'},
 {id:'distillery',name:'The Distillery District',address:'55 Mill St, Toronto',website:'https://www.thedistillerydistrict.com',note:'户外拍摄注意风与光线变化。'},
 {id:'studio',name:'SCULP Studio',address:'Toronto · Studio appointment',note:'试妆前确认参考图与发饰。'},
 {id:'liberty',name:'Liberty Grand',address:'25 British Columbia Rd, Toronto',website:'https://libertygrand.com',note:'大型场次提前确认团队集合点。'}
];
export const partners=[
 {id:'mango',name:'Mango Studios',type:'Photography',instagram:'mangostudios',website:'https://mangostudios.com',note:'示例：提前沟通 final look 拍摄时间。'},
 {id:'rebecca',name:'Rebecca Events',type:'Planner',instagram:'rebeccaevents_demo',note:'示例：由 planner 汇总当天时间表。'},
 {id:'lumi',name:'Lumi Photography',type:'Photography',instagram:'lumi_demo',note:'示例：偏爱自然光肖像。'},
 {id:'ever',name:'Ever After Planning',type:'Planner',instagram:'everafter_demo',note:'示例：准备区布置时间需要提前确认。'},
 {id:'bloom',name:'Bloom & Stem',type:'Florist',instagram:'bloomstem_demo',note:'示例：花束到达后再安排完整造型照片。'},
 {id:'frame',name:'Frame Story Films',type:'Videography',instagram:'framestory_demo',note:'示例：与摄影同步 first look 时间。'},
 {id:'rose',name:'Rosewood Events',type:'Planner',instagram:'rosewood_demo',note:'示例：团队沟通节奏清晰。'},
 {id:'sunday',name:'Sunday Portraits',type:'Photography',instagram:'sunday_demo',note:'示例：活动肖像合作。'}
];
const names=['Sarah Chen','Amy Wong','Jessica Li','Lisa Park','Chloe Zhang','Olivia Liu','Emma Tan','Sophie Wang','Isabella Lin','Grace Wu','Victoria Sun','Rachel Kim'];
export const clients=names.map((name,i)=>({id:'c'+i,name,city:i%3?'Toronto':'Markham',email:name.toLowerCase().replace(' ','.')+'@example.com',phone:'+1 (416) 555-01'+String(i).padStart(2,'0'),wechat:'demo_'+name.split(' ')[0].toLowerCase(),instagram:'demo_'+name.replace(' ','_').toLowerCase(),birthday:'1993-'+String(i%12+1).padStart(2,'0')+'-15',weddingDate:i%2?'2026-09-12':'2026-10-02',referral:i%2?'朋友推荐':'合作摄影师推荐',preferences:i%2?['偏爱干净、轻盈的妆感','发型希望有自然蓬松感']:['喜欢自然轻薄底妆','不喜欢过重的睫毛'],opportunity:i%2?'来年周年纪念照，可在本人同意后跟进。':'提到十二月公司晚宴，待确认日期。'}));
const types=['Wedding','Trial','Event','Photoshoot','Commercial','Education'];
const pricing={Wedding:1990,Trial:350,Event:280,Photoshoot:490,Commercial:850,Education:450};
const bookingArtists=artists.filter(a=>a.bookingEligible!==false);
export const bookings=Array.from({length:24},(_,i)=>{
 const service=i===0?'Wedding':types[i%6],clientId='c'+(i%12),staff=[bookingArtists[i%bookingArtists.length].id];if(service==='Wedding')staff.push(bookingArtists[(i+3)%bookingArtists.length].id);
 const date=i===0?'2026-10-02':i<6?'2026-10-'+String(3+Math.floor(i/2)).padStart(2,'0'): '2026-09-'+String(30-(i-6)).padStart(2,'0');
 const venueId=service==='Trial'||service==='Education'?'studio':venues[i%6].id;
 return {id:'b'+i,date,startTime:service==='Wedding'?'07:00':'10:00',endTime:service==='Wedding'?'17:00':'12:00',clientId,artistIds:staff,venueId,partnerIds:service==='Trial'||service==='Education'?[]:i%2?['lumi','ever']:['mango','rebecca','bloom'],service,price:pricing[service],status:i===0||i>=6?'Completed':i===5?'Inquiry':'Confirmed',createdAt:date+'T08:00:00-04:00'};
});
export const notes=bookings.map((b,i)=>({id:'n'+i,entityType:'booking',entityId:b.id,createdBy:b.artistIds[0],createdAt:b.date+'T18:00:00-04:00',source:'manual',rawText:i===0?'今天 Sarah 整体很满意，尤其喜欢轻薄的底妆。第一次的睫毛她觉得有点重，后来换了一副轻一些的。头发做了自然的松卷。她提到十二月公司有晚宴，妹妹可能明年夏天结婚。摄影是 Mango，准备房靠窗的光线很好。':'今天客人喜欢自然一些的妆感，沟通过参考图后做了轻薄底妆和柔和眉形。发型最后做了调整，整体反馈满意。下次服务可以先询问睫毛和发饰的偏好。',aiSummary:i===0?'喜欢轻薄底妆与松卷；更换轻量睫毛后满意。准备房自然光良好。':'偏爱自然妆感；发型调整后满意。下次提前确认睫毛与发饰。',structuredData:{preferences:clients[i%12].preferences,opportunities:[clients[i%12].opportunity]},summarySource:'prepared_demo'}));
const weddingImages=['garden-bride-hero','bridal-profile','selected-window-bride','selected-veil-detail','selected-smiling-bride','garden-couple'];
const eventImages=['chair-portrait','occasions-feature-motion-red','occasions-feature-red-flower'];
export const media=bookings.flatMap((b,i)=>(b.service==='Wedding'||b.service==='Trial'?weddingImages.slice(0,b.service==='Wedding'?6:3):eventImages).map((file,j)=>({id:'m'+i+'-'+j,bookingId:b.id,clientId:b.clientId,artistIds:b.artistIds,fileUrl:'assets/'+file+'.jpg',category:b.service==='Wedding'||b.service==='Trial'?['Bride','Makeup','Hair','Details','Final Look','Bride'][j]:['Editorial','Event','Final Look'][j],createdAt:b.date,source:'import',sample:true})));
const studioAsset='https://2ez4jz.github.io/sculpstudio/assets/images/';
const numbered=(artist,count)=>Array.from({length:count},(_,i)=>`artists/${artist}/${artist}-${String(i+1).padStart(2,'0')}.webp`);
const portfolioSets={
 angelina:numbered('angelina',26),elaine:numbered('elaine',13),emily:numbered('emily',8),giselle:numbered('giselle',19),mira:numbered('mira',13),yuki:numbered('yuki',13),
 michelle:['michelle-portrait.webp'],
 miranda:[...numbered('miranda',40),...['bridal-approach-orchid.webp','bridal-editorial.webp','bridal-profile.webp','bridal-story-soft-portrait.webp','calla-lily-portrait.webp','castle-couple.webp','chair-portrait.webp','civil-ceremony-styling.webp','collection-517.webp','collection-536.webp','collection-598.webp','collection-618.webp','collection-650.webp','collection-666.webp','collection-694.webp','collection-706.webp','collection-707.webp','collection-708.webp','collection-709.webp','collection-710.webp','collection-711.webp','collection-712.webp','collection-713.webp','collection-714.webp','collection-715.webp','collection-716.webp','collection-717.webp','collection-718.webp','floral-ceremony.webp','garden-bride-hero.webp','garden-couple.webp','garden-wedding.webp','home-craft-makeup.webp','home-selected-right-bottom.webp','monochrome-bride.webp','occasions-feature-couple.webp','occasions-feature-motion-red.webp','occasions-feature-red-flower.webp','selected-film-couple.webp','selected-sepia-portrait.webp','selected-smiling-bride.webp','selected-veil-couple.webp','selected-veil-detail.webp','selected-window-bride.webp','veil-portrait.webp','window-bouquet.webp','woodland-veil.webp'],...Array.from({length:21},(_,i)=>`editorial/editorial-${String(i+1).padStart(2,'0')}.webp`).filter(path=>!['editorial-07.webp','editorial-08.webp','editorial-12.webp'].some(x=>path.endsWith(x)))]
};
export const portfolioMedia=Object.entries(portfolioSets).flatMap(([artistId,files])=>files.map((file,index)=>({id:`portfolio-${artistId}-${index+1}`,bookingId:null,clientId:null,artistIds:[artistId],fileUrl:studioAsset+file,category:'Official Portfolio',createdAt:'2026-10-03',source:'sculpstudio',sample:false})));
export const demoSelections=media.filter((_,i)=>i%9===0).map(m=>({mediaId:m.id,artistId:m.artistIds[0],collection:'personal',selectedAt:'2026-10-03T00:00:00-04:00'}));
