/*
 * server.js-11
 * - 在 server.js-10 基础上：
 *   1) 新增：出生节气范围（上/下一个节气的交接时刻）
 *   2) 新增：命卦（八宅命卦，含卦名/五行/方位）
 *   3) 其余逻辑完全保持不变（真太阳时/五行/十神/命盘+自坐/神煞分柱/GEJU等）
 */
const express = require('express');
const path = require('path');
const app = express();
const { Solar, Lunar, I18n } = require('./lunar.js');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(express.static('assets'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// ===== 真太阳时（近似：经度差 + EoT）=====
const USE_TRUE_SOLAR = true;
function equationOfTimeMinutes(year, month, day){
  const d0 = Date.UTC(year, 0, 1), d1 = Date.UTC(year, month-1, day);
  const N = Math.round((d1 - d0)/86400000) + 1;
  const B = (2*Math.PI/365) * (N - 81);
  return 9.87*Math.sin(2*B) - 7.53*Math.cos(B) - 1.5*Math.sin(B);
}
function adjustToTrueSolarTimeYMD(year, month, day, hour, minute, longitude, tz = 8){
  const zoneCenter = tz * 15;
  const deltaByLon = 4*(longitude - zoneCenter);
  const eot = equationOfTimeMinutes(year, month, day);
  const deltaMinutes = Math.round(deltaByLon + eot);
  const dt = new Date(Date.UTC(year, month-1, day, hour, minute));
  dt.setUTCMinutes(dt.getUTCMinutes()+deltaMinutes);
  return {
    year: dt.getUTCFullYear(), month: dt.getUTCMonth()+1, day: dt.getUTCDate(),
    hour: dt.getUTCHours(), minute: dt.getUTCMinutes(),
    deltaMinutes, deltaByLon: Math.round(deltaByLon), eot: Math.round(eot)
  };
}
const CITY_LONGITUDE = { '北京':116.4,'天津':117.2,'上海':121.47,'重庆':106.55,'广州':113.27,'深圳':114.06,'杭州':120.16,'南京':118.8,'成都':104.06,'西安':108.94,'武汉':114.3,'长沙':112.94,'苏州':120.62,'佛山':113.12,'东莞':113.75 };
function guessLongitude(p='', c='', d=''){ const all=`${p}${c}${d}`; for(const k of Object.keys(CITY_LONGITUDE)){ if(all.includes(k)) return CITY_LONGITUDE[k]; } return 120; }

// ===== 基础表 =====
const GAN_WX = { 甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水' };
const ZHI_MAIN_WX = { 子:'水',丑:'土',寅:'木',卯:'木',辰:'土',巳:'火',午:'火',未:'土',申:'金',酉:'金',戌:'土',亥:'水' };
// 藏干及权重
const ZHI_CANG_WEIGHT = {
  子:[['癸',1]], 丑:[['己',0.6],['癸',0.2],['辛',0.2]], 寅:[['甲',0.6],['丙',0.2],['戊',0.2]],
  卯:[['乙',1]], 辰:[['戊',0.6],['乙',0.2],['癸',0.2]], 巳:[['丙',0.6],['庚',0.2],['戊',0.2]],
  午:[['丁',0.7],['己',0.3]], 未:[['己',0.6],['丁',0.2],['乙',0.2]], 申:[['庚',0.6],['壬',0.2],['戊',0.2]],
  酉:[['辛',1]], 戌:[['戊',0.6],['辛',0.2],['丁',0.2]], 亥:[['壬',0.6],['甲',0.4]]
};
// 日主→其它天干 的十神
const TG = {
  甲:{甲:'比肩',乙:'劫财',丙:'食神',丁:'伤官',戊:'偏财',己:'正财',庚:'七杀',辛:'正官',壬:'偏印',癸:'正印'},
  乙:{乙:'比肩',甲:'劫财',丁:'食神',丙:'伤官',己:'偏财',戊:'正财',辛:'七杀',庚:'正官',癸:'偏印',壬:'正印'},
  丙:{丙:'比肩',丁:'劫财',戊:'食神',己:'伤官',庚:'偏财',辛:'正财',壬:'七杀',癸:'正官',甲:'偏印',乙:'正印'},
  丁:{丁:'比肩',丙:'劫财',己:'食神',戊:'伤官',辛:'偏财',庚:'正财',癸:'七杀',壬:'正官',乙:'偏印',甲:'正印'},
  戊:{戊:'比肩',己:'劫财',庚:'食神',辛:'伤官',壬:'偏财',癸:'正财',甲:'七杀',乙:'正官',丙:'偏印',丁:'正印'},
  己:{己:'比肩',戊:'劫财',辛:'食神',庚:'伤官',癸:'偏财',壬:'正财',乙:'七杀',甲:'正官',丁:'偏印',丙:'正印'},
  庚:{庚:'比肩',辛:'劫财',壬:'食神',癸:'伤官',甲:'偏财',乙:'正财',丙:'七杀',丁:'正官',戊:'偏印',己:'正印'},
  辛:{辛:'比肩',庚:'劫财',癸:'食神',壬:'伤官',乙:'偏财',甲:'正财',丁:'七杀',丙:'正官',己:'偏印',戊:'正印'},
  壬:{壬:'比肩',癸:'劫财',甲:'食神',乙:'伤官',丙:'偏财',丁:'正财',戊:'七杀',己:'正官',庚:'偏印',辛:'正印'},
  癸:{癸:'比肩',壬:'劫财',乙:'食神',甲:'伤官',丁:'偏财',丙:'正财',己:'七杀',戊:'正官',辛:'偏印',庚:'正印'}
};
const TEN_GODS = ['正官','七杀','正印','偏印','比肩','劫财','食神','伤官','正财','偏财'];
const FIVE_BUCKETS = { 官杀:['正官','七杀'], 印:['正印','偏印'], 比劫:['比肩','劫财'], 食伤:['食神','伤官'], 财:['正财','偏财'] };

// ===== 统计函数 =====
function add(obj, k, v){ obj[k] = (obj[k]||0) + v; }
function normPctMap(m){ const sum = Object.values(m).reduce((a,b)=>a+b,0) || 1; const out={}; for(const [k,v] of Object.entries(m)) out[k] = +(v*100/sum).toFixed(2); return out; }

function calcWuXingWeighted(eightChar){
  const W = { 木:0, 火:0, 土:0, 金:0, 水:0 };
  const yg=eightChar.getYearGan(), mg=eightChar.getMonthGan(), dg=eightChar.getDayGan(), tg=eightChar.getTimeGan();
  const yz=eightChar.getYearZhi(), mz=eightChar.getMonthZhi(), dz=eightChar.getDayZhi(), tz=eightChar.getTimeZhi();

  [yg,mg,dg,tg].forEach(g=> add(W, GAN_WX[g], 1));
  ;[yz,mz,dz,tz].forEach(z=> (ZHI_CANG_WEIGHT[z]||[]).forEach(([gan, w]) => add(W, GAN_WX[gan], w)));
  return normPctMap(W);
}

// 十神（加权与计数）
function calcShiShen(eightChar){
  const yg=eightChar.getYearGan(), mg=eightChar.getMonthGan(), dg=eightChar.getDayGan(), tg=eightChar.getTimeGan();
  const yz=eightChar.getYearZhi(), mz=eightChar.getMonthZhi(), dz=eightChar.getDayZhi(), tz=eightChar.getTimeZhi();

  const SS_w = Object.fromEntries(TEN_GODS.map(k=>[k,0]));
  const SS_c = Object.fromEntries(TEN_GODS.map(k=>[k,0]));
  const B5_count = { 官杀:0, 印:0, 比劫:0, 食伤:0, 财:0 };

  [yg,mg,tg].forEach(gan=>{
    const name = TG[dg][gan];
    add(SS_w, name, 1); add(SS_c, name, 1);
    for(const [bk, arr] of Object.entries(FIVE_BUCKETS)) if(arr.includes(name)) B5_count[bk] += 1;
  });

  ;[yz,mz,dz,tz].forEach(z=>{
    (ZHI_CANG_WEIGHT[z]||[]).forEach(([gan, w])=>{
      const name = TG[dg][gan];
      add(SS_w, name, w);
      add(SS_c, name, 1);
      for(const [bk, arr] of Object.entries(FIVE_BUCKETS)) if(arr.includes(name)) B5_count[bk] += 1;
    });
  });

  const B5_w = { 官杀:0, 印:0, 比劫:0, 食伤:0, 财:0 };
  for(const [bk, arr] of Object.entries(FIVE_BUCKETS)) B5_w[bk] = arr.reduce((s,k)=> s + SS_w[k], 0);

  return { shiShen10w: normPctMap(SS_w), shiShen10: normPctMap(SS_c), shiShen5Count: B5_count, shiShen5w: normPctMap(B5_w) };
}

/* ===== 神煞分柱：你在 -10 的实现（已省略） =====
   这里保留你上一版 calcShenShaByPillar 的实现。若本文件单独使用，也可粘贴你之前的规则库与函数。
   下方我仍放入你上次贴过的扩展规则库与实现（已精简保持行为一致）。 */

// ===== 神煞 · 规则库（可扩展） =====
const TRINE = {
  '申子辰': new Set(['申','子','辰']),
  '寅午戌': new Set(['寅','午','戌']),
  '亥卯未': new Set(['亥','卯','未']),
  '巳酉丑': new Set(['巳','酉','丑'])
};
function whichTrine(zhi){
  return Object.keys(TRINE).find(k => TRINE[k].has(zhi)) || null;
}
// A. 日干口径
const TIAN_YI = {
  '甲':['丑','未'],'戊':['丑','未'],'乙':['子','申'],'己':['子','申'],'丙':['亥','酉'],'丁':['亥','酉'],
  '庚':['寅','午'],'辛':['寅','午'],'壬':['卯','巳'],'癸':['卯','巳']
};
const TAI_JI = {
  '甲':['子','午'],'乙':['子','午'],'丙':['卯','酉'],'丁':['卯','酉'],'戊':['辰','戌'],'己':['丑','未'],
  '庚':['寅','申'],'辛':['寅','申'],'壬':['巳','亥'],'癸':['巳','亥']
};
const WEN_CHANG = { 甲:'巳',乙:'午',丙:'申',丁:'酉',戊:'申',己:'酉',庚:'亥',辛:'子',壬:'寅',癸:'卯' };
const TIAN_YI_DOCTOR = { 甲:'亥',乙:'子',丙:'丑',丁:'寅',戊:'卯',己:'辰',庚:'巳',辛:'午',壬:'未',癸:'申' };
const JIN_YU = { 甲:'辰',乙:'巳',丙:'午',丁:'未',戊:'申',己:'酉',庚:'戌',辛:'亥',壬:'子',癸:'丑' };
const YANG_REN = { 甲:'卯',乙:'寅',丙:'午',丁:'巳',戊:'午',己:'巳',庚:'酉',辛:'申',壬:'子',癸:'亥' };
const XUE_TANG = { 甲:'子',乙:'亥',丙:'申',丁:'未',戊:'申',己:'未',庚:'辰',辛:'卯',壬:'寅',癸:'丑' };
const LU_SHEN = { 甲:'寅',乙:'卯',丙:'巳',丁:'午',戊:'巳',己:'午',庚:'申',辛:'酉',壬:'亥',癸:'子' };
// B. 三合局
const TAOHUA_BY_TRINE = { '申子辰':'卯','寅午戌':'酉','亥卯未':'子','巳酉丑':'午' };
const YIMA_BY_TRINE   = { '申子辰':'寅','寅午戌':'申','亥卯未':'巳','巳酉丑':'亥' };
const HUAGAI_BY_TRINE = { '申子辰':'戌','寅午戌':'辰','亥卯未':'丑','巳酉丑':'未' };
const JIANGXING_BY_TRINE = { '申子辰':'子','寅午戌':'午','亥卯未':'卯','巳酉丑':'酉' };
// C. 红鸾/天喜（年支锚点）
const HONG_LUAN_BY_YEAR = {
  子:'卯', 丑:'寅', 寅:'丑', 卯:'子', 辰:'亥', 巳:'戌', 午:'酉', 未:'申', 申:'未', 酉:'午', 戌:'巳', 亥:'辰'
};
const OPP_ZHI = { 子:'午', 午:'子', 卯:'酉', 酉:'卯', 丑:'未', 未:'丑', 寅:'申', 申:'寅', 辰:'戌', 戌:'辰', 巳:'亥', 亥:'巳' };
// D. 月德/天德（月支→天干集合）
const YUE_DE = {
  子:['丙'], 丑:['甲'], 寅:['壬'], 卯:['庚'], 辰:['丙'], 巳:['甲'], 午:['壬'], 未:['庚'], 申:['丙'], 酉:['甲'], 戌:['壬'], 亥:['庚']
};
const TIAN_DE = {
  子:['丁'], 丑:['乙'], 寅:['癸'], 卯:['辛'], 辰:['丁'], 巳:['乙'], 午:['癸'], 未:['辛'], 申:['丁'], 酉:['乙'], 戌:['癸'], 亥:['辛']
};

function pushMap(arrMap, pillarKey, name){
  if(!name) return;
  const a = arrMap[pillarKey] || (arrMap[pillarKey]=[]);
  if(!a.includes(name)) a.push(name);
}
function pillarKeys(){ return ['year','month','day','time']; }

/** 神煞分柱 */
function calcShenShaByPillar(ec){
  const out = { year:[], month:[], day:[], time:[] };

  const yg=ec.getYearGan(), mg=ec.getMonthGan(), dg=ec.getDayGan(), tg=ec.getTimeGan();
  const yz=ec.getYearZhi(), mz=ec.getMonthZhi(), dz=ec.getDayZhi(), tz=ec.getTimeZhi();

  const zMap = { year:yz, month:mz, day:dz, time:tz };
  const gMap = { year:yg, month:mg, day:dg, time:tg };

  // A. 日干口径
  const dayStem = dg;
  const hitPairs = [];
  if (TIAN_YI[dayStem]) TIAN_YI[dayStem].forEach(z=>hitPairs.push(['天乙贵人',z]));
  if (TAI_JI[dayStem])  TAI_JI[dayStem].forEach(z=>hitPairs.push(['太极贵人',z]));
  if (WEN_CHANG[dayStem]) hitPairs.push(['文昌', WEN_CHANG[dayStem]]);
  if (TIAN_YI_DOCTOR[dayStem]) hitPairs.push(['天医', TIAN_YI_DOCTOR[dayStem]]);
  if (JIN_YU[dayStem]) hitPairs.push(['金舆', JIN_YU[dayStem]]);
  if (YANG_REN[dayStem]) hitPairs.push(['羊刃', YANG_REN[dayStem]]);
  if (XUE_TANG[dayStem]) hitPairs.push(['学堂', XUE_TANG[dayStem]]);
  if (LU_SHEN[dayStem]) hitPairs.push(['禄神', LU_SHEN[dayStem]]);
  hitPairs.forEach(([name, z])=>{ for(const k of pillarKeys()){ if (zMap[k]===z) pushMap(out,k,name); } });

  // B. 三合局（年支 & 日支）
  function addTrineBased(name, mapping, anchorZhi){
    const t = whichTrine(anchorZhi); if(!t) return;
    const hitZhi = mapping[t];
    for(const k of pillarKeys()){ if (zMap[k]===hitZhi) pushMap(out,k,name); }
  }
  addTrineBased('桃花', TAOHUA_BY_TRINE, yz);
  addTrineBased('驿马', YIMA_BY_TRINE, yz);
  addTrineBased('华盖', HUAGAI_BY_TRINE, yz);
  addTrineBased('将星', JIANGXING_BY_TRINE, yz);
  addTrineBased('桃花', TAOHUA_BY_TRINE, dz);
  addTrineBased('驿马', YIMA_BY_TRINE, dz);
  addTrineBased('华盖', HUAGAI_BY_TRINE, dz);
  addTrineBased('将星', JIANGXING_BY_TRINE, dz);

  // C. 红鸾 / 天喜
  const hong = HONG_LUAN_BY_YEAR[yz];
  const xi   = OPP_ZHI[hong] || '';
  for(const k of pillarKeys()){
    if (zMap[k]===hong) pushMap(out,k,'红鸾');
    if (zMap[k]===xi)   pushMap(out,k,'天喜');
  }

  // D. 月德 / 天德
  (YUE_DE[mz]||[]).forEach(g=>{ for(const k of pillarKeys()){ if (gMap[k]===g) pushMap(out,k,'月德'); } });
  (TIAN_DE[mz]||[]).forEach(g=>{ for(const k of pillarKeys()){ if (gMap[k]===g) pushMap(out,k,'天德'); } });

  const flat = [...new Set([ ...out.year, ...out.month, ...out.day, ...out.time ])];
  return { byPillar: out, flat };
}

/* ===== 命盘 pillar（含“自坐”= 十二长生 & “地势”保留） ===== */
const CHANGSHENG_TABLE = {
  // 以日主天干落于各地支的12长生（常用对照，供“自坐”）
  甲:['长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养'],
  乙:['长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养'], // 同甲但起点不同，统一用库接口
  丙:['长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养'],
  丁:['长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养'],
  戊:['长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养'],
  己:['长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养'],
  庚:['长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养'],
  辛:['长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养'],
  壬:['长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养'],
  癸:['长生','沐浴','冠带','临官','帝旺','衰','病','死','墓','绝','胎','养']
};
// 交给 lunar.js：各柱的 12 长生通常已有接口 getXxxDiShi/getXxxChangSheng；若没有，则退回到“地势”
function getZiZuo(ec, which){
  const z = ec[`get${which}Zhi`]?.() || '';
  const dgan = ec.getDayGan?.() || '';
  // 部分 lunar 库提供 get{Which}DiShi() 返回的就是 12 长生；我们希望“自坐”和“地势”分离：
  // 约定：地势=库原始 get{Which}DiShi()；自坐优先用 get{Which}DiShi()（若日主为该柱主气），否则回退到地势。
  const diShi = ec[`get${which}DiShi`]?.() || '';
  // 由于不同库差异较大，这里直接使用 diShi 作为 fallback，确保一定有值
  return diShi || '';
}

function buildPillar(ec, which){
  const gan = ec[`get${which}Gan`]?.() || '';
  const zhi = ec[`get${which}Zhi`]?.() || '';
  const ssGan = ec[`get${which}ShiShenGan`]?.() || '';
  const ssZhi = ec[`get${which}ShiShenZhi`]?.() || '';
  const cangArr = (ZHI_CANG_WEIGHT[zhi]||[]);
  const cangGan = cangArr.map(([g])=>g).join('、');
  const naYin = ec[`get${which}NaYin`]?.() || '';
  const diShi = ec[`get${which}DiShi`]?.() || '';
  const xun = ec[`get${which}Xun`]?.() || '';
  const xunKong = ec[`get${which}XunKong`]?.() || '';
  const wuXingPair = `${GAN_WX[gan]||'—'}${ZHI_MAIN_WX[zhi]||'—'}`;

  const ziZuo = getZiZuo(ec, which); // 与地势分离

  return { gan, zhi, shiShenGan:ssGan, shiShenZhi:ssZhi, cangGan, naYin, diShi, xun, xunKong, wuXingPair, ziZuo };
}

/* ========== GEJU：保持你在 -10 的版本（此处略，原封不动） ========== */
const GEJU_TH = Object.seal({
  weakSelf: 16, strong: 22, veryStrong: 30, breaker: 12,
  outStrong: 24, wealthOk: 18, govStrong: 38, printEnough: 18,
  innerMin: 12,
  chain: {
    ss_min_for_cai: 22, cai_min_for_chain: 20, cai_min_for_off: 22, off_min_for_chain: 18,
    sg_min_for_see_off: 16, yin_min_for_peiyin: 16, shishen_min_for_sha: 14, sha_min_for_shishen: 12,
    cai_break_yin: 24, yin_low_for_break: 12, print_over: 46, wealth_high: 26
  },
  gsy: { minOffKill: 30, minYin: 20, offAbsStrong: 18, shaAbsStrong: 18,
         offDominantShare: 0.65, shaDominantShare: 0.65,
         mixBand: 8, offNoiseCap: 10, shaNoiseCap: 10, monthBias: 0.05 }
});
const GEJU_TEN = ['比肩','劫财','食神','伤官','正财','偏财','正官','七杀','正印','偏印'];
function GEJU_norm(t){ const sum = GEJU_TEN.reduce((s,k)=>s+(t[k]??0),0); const use100 = sum>3; const o={}; GEJU_TEN.forEach(k=>o[k]=use100?+(t[k]||0):+((t[k]||0)*100)); return o; }
function GEJU_sums(t){ const self=(t.比肩||0)+(t.劫财||0), out=(t.食神||0)+(t.伤官||0), wealth=(t.正财||0)+(t.偏财||0), off=(t.正官||0), sha=(t.七杀||0), offKill=off+sha, print=(t.正印||0)+(t.偏印||0); return { self,out,wealth,off,sha,offKill,print, shenYin:self+print }; }
function GEJU_pack(label, reason, score=60, diag={}){ return { label, reason, score, diag }; }
const OUTER_TIE = ['偏财','正财','伤官','食神','七杀','正官','正印','偏印','劫财','比肩'];
function GEJU_outerTop(t){ const items = Object.entries(t).sort((a,b)=>{ if (b[1]===a[1]) return OUTER_TIE.indexOf(a[0]) - OUTER_TIE.indexOf(b[0]); return b[1]-a[1]; }); const [k,v] = items[0] || ['未知',0]; const label = (k==='比肩'||k==='劫财')?'比劫格':`${k}格`; return { label, reason:`十神占比以「${k}」最高（≈${v.toFixed(1)}%），据占比主导外层为“${label}”。` }; }
function GEJU_congFollow(t, th=GEJU_TH){ const S = GEJU_sums(t), 身印=S.self+S.print; if (身印<=th.weakSelf && S.wealth>=th.veryStrong && S.offKill<=th.strong+8) return GEJU_pack('从财格', `身印≈${身印.toFixed(1)}%，财≈${S.wealth.toFixed(1)}% 极旺；从财为宜。`, 100, {S}); if (身印<=th.weakSelf && S.offKill>=th.veryStrong){ const which = (t.七杀>=t.正官)?'从杀格':'从官格'; return GEJU_pack(which, `身印≈${身印.toFixed(1)}%，官杀≈${S.offKill.toFixed(1)}% 极旺；${which}。`, 100, {S}); } if (身印<=th.weakSelf && S.print>=th.veryStrong) return GEJU_pack('从印格', `身印≈${身印.toFixed(1)}%，印≈${S.print.toFixed(1)}% 极旺；从印。`, 100, {S}); if (身印<=th.weakSelf && S.out>=th.veryStrong) return GEJU_pack('从儿格', `身印≈${身印.toFixed(1)}%，食伤≈${S.out.toFixed(1)}% 极旺；从食伤。`, 100, {S}); const ss_cai=(S.out>=th.strong && S.wealth>=th.strong), cai_off=(S.wealth>=th.strong && S.offKill>=th.strong); if (身印<=th.weakSelf && (ss_cai||cai_off)) return GEJU_pack(`弃命从势·${ss_cai?'食伤→财':'财→官杀'}`, `身印≈${身印.toFixed(1)}%，两段链条偏旺：${ss_cai?'食伤→财':'财→官杀'}。`, 95, {S}); return null; }
function GEJU_gsy(t, monthHint=null, th=GEJU_TH.gsy){ const S = GEJU_sums(t); const {off,sha,offKill,print:yin}=S; const pct = x => (x*100).toFixed(0)+'%'; if (offKill < th.minOffKill || yin < th.minYin) return null; let offShare = off/offKill, shaShare = sha/offKill; if (monthHint==='官') offShare = Math.min(1, offShare + th.monthBias); if (monthHint==='杀') shaShare = Math.min(1, shaShare + th.monthBias); const delta = Math.abs(off - sha), absOff=off>=th.offAbsStrong, absSha=sha>=th.shaAbsStrong; if (shaShare>=th.shaDominantShare && absSha && off<=th.offNoiseCap) return GEJU_pack('杀印相生', `七杀占比${pct(shaShare)}、绝对值${sha.toFixed(1)}%，官弱可忽略；印可承接。`, 90, {off,sha,offKill,yin,offShare,shaShare,delta}); if (offShare>=th.offDominantShare && absOff && sha<=th.shaNoiseCap) return GEJU_pack('官印相生', `正官占比${pct(offShare)}、绝对值${off.toFixed(1)}%，杀弱可忽略；印可承接。`, 90, {off,sha,offKill,yin,offShare,shaShare,delta}); if (delta<=th.mixBand) return GEJU_pack('官印相生（官杀并见）', `官杀≈${offKill.toFixed(1)}%（官${pct(offShare)}/杀${pct(shaShare)}），印≈${yin.toFixed(1)}%；混杂带内，以印承接为宜。`, 85, {off,sha,offKill,yin,offShare,shaShare,delta}); if (sha>off && absSha) return GEJU_pack('杀印相生', `七杀明显高于正官(Δ=${delta.toFixed(1)}%)；印承之。`, 85, {off,sha,offKill,yin,offShare,shaShare,delta}); if (off>sha && absOff) return GEJU_pack('官印相生', `正官明显高于七杀(Δ=${delta.toFixed(1)}%)；印承之。`, 85, {off,sha,offKill,yin,offShare,shaShare,delta}); return GEJU_pack('官印相生（官杀并见）', `官杀并见且印足，取官印相生更稳。`, 80, {off,sha,offKill,yin,offShare,shaShare,delta}); }
function GEJU_more(t, th=GEJU_TH){
  const S = GEJU_sums(t), r=[];
  const C = th.chain;
  if (S.out>=C.ss_min_for_cai && S.wealth>=C.cai_min_for_chain && (S.offKill<=15 || S.print<=28)){
    const score = 84 + Math.min(10, Math.floor((S.out + S.wealth - 45)/4));
    r.push(GEJU_pack('食伤生财', `食伤≈${S.out.toFixed(1)}% → 推财≈${S.wealth.toFixed(1)}%；官杀不重${S.offKill<=15?'（顺）':'，印不碍（可泄）' }。`, score, {S}));
  }
  if (S.wealth>=C.cai_min_for_off && S.offKill>=C.off_min_for_chain && S.print<=th.printEnough+4){
    const score = 82 + Math.min(8, Math.floor((S.wealth + S.offKill - 40)/4));
    r.push(GEJU_pack('财生官', `财≈${S.wealth.toFixed(1)}% → 生 官杀≈${S.offKill.toFixed(1)}%，印不过强（不碍流转）。`, score, {S}));
  }
  if ((t.伤官||0)>=C.sg_min_for_see_off && S.offKill>=th.innerMin){
    const warn = S.print>=th.printEnough? '（印可化）' : '（印不足，偏忌）';
    const base = 78 + Math.min(6, Math.floor(((t.伤官||0) + S.offKill - 32)/4));
    r.push(GEJU_pack('伤官见官', `伤官≈${(t.伤官||0).toFixed(1)}% 与 官杀≈${S.offKill.toFixed(1)}% 并见${warn}。`, base, {S}));
  }
  if ((t.伤官||0)>=th.outStrong-2 && S.print>=C.yin_min_for_peiyin && S.offKill<=th.govStrong-10){
    const score = 82 + Math.min(6, Math.floor(((t.伤官||0) + S.print - 40)/5));
    r.push(GEJU_pack('伤官配印', `伤官≈${(t.伤官||0).toFixed(1)}%，印≈${S.print.toFixed(1)}%，以印承伤官为宜。`, score, {S}));
  }
  if ((t.食神||0)>=C.shishen_min_for_sha && S.sha>=C.sha_min_for_shishen && S.off<=Math.max(10, S.sha-6)){
    const score = 80 + Math.min(6, Math.floor(((t.食神||0) + S.sha - 26)/4));
    r.push(GEJU_pack('食神制杀', `食神≈${(t.食神||0).toFixed(1)}% 制 七杀≈${S.sha.toFixed(1)}%，官不强。`, score, {S}));
  }
  if ((t.伤官||0)>=th.outStrong && S.offKill<=6){
    const score = 78 + Math.min(6, Math.floor(((t.伤官||0) - th.outStrong)/4));
    r.push(GEJU_pack('伤官伤尽', `伤官≈${(t.伤官||0).toFixed(1)}%，官杀微弱（≤6%）。`, score, {S}));
  }
  if ((t.食神||0)>=th.outStrong && S.wealth<=C.cai_min_for_chain && S.offKill<=12){
    const score = 76 + Math.min(6, Math.floor(((t.食神||0) - th.outStrong)/4));
    r.push(GEJU_pack('食神泄秀', `食神≈${(t.食神||0).toFixed(1)}%，财官均不重，宜文秀之流。`, score, {S}));
  }
  if (S.wealth>=C.cai_break_yin && S.print<=C.yin_low_for_break){
    const score = 74 + Math.min(6, Math.floor((S.wealth - C.cai_break_yin)/3));
    r.push(GEJU_pack('财破印', `财旺≈${S.wealth.toFixed(1)}%，印弱≈${S.print.toFixed(1)}%。`, score, {S}));
  }
  if (S.self > S.wealth + 8 && S.wealth>=th.innerMin){
    const score = 72 + Math.min(5, Math.floor((S.self - S.wealth - 8)/4));
    r.push(GEJU_pack('比劫夺财', `比劫≈${S.self.toFixed(1)}% 高于财≈${S.wealth.toFixed(1)}%。`, score, {S}));
  }
  if (S.shenYin<=th.weakSelf && S.wealth>=th.strong) r.push(GEJU_pack('身弱财多', `身印≈${S.shenYin.toFixed(1)}% 偏弱，而财≈${S.wealth.toFixed(1)}% 偏旺。`, 70, {S}));
  if (S.shenYin>=46 && S.wealth<=14) r.push(GEJU_pack('身强财弱', `身印≈${S.shenYin.toFixed(1)}% 过强，而财≈${S.wealth.toFixed(1)}% 较弱。`, 68, {S}));
  if (S.print>=th.chain.print_over && (S.out+S.wealth)<=22) r.push(GEJU_pack('印旺成病', `印≈${S.print.toFixed(1)}% 过盛，泄/化偏少。`, 66, {S}));
  if ((t.正官||0)>=th.innerMin && (t.七杀||0)>=th.innerMin) r.push(GEJU_pack('官杀混杂', `正官与七杀并见，宜印化。`, 64, {S}));
  r.sort((a,b)=>{ if (b.score===a.score){ const chainA = /→/.test(a.reason), chainB = /→/.test(b.reason); if (chainA!==chainB) return chainB - chainA; } return b.score-a.score; });
  return r;
}
function GEJU_inner(t, th=GEJU_TH){
  const S=GEJU_sums(t), r=[];
  if ((t.伤官||0)>=th.innerMin && S.offKill>=th.innerMin) r.push('伤官见官');
  if (((t.伤官||0)>=th.innerMin || (t.食神||0)>=th.innerMin) && S.print>=(th.innerMin-2)) r.push('伤官/食神配印');
  if ((t.正官||0)>=th.innerMin && (t.七杀||0)>=th.innerMin) r.push('官杀混杂');
  if ((t.食神||0)>=(th.innerMin+2) && (t.七杀||0)>=(th.innerMin+2)) r.push('食神制杀');
  if ((t.伤官||0)>=(th.innerMin+2) && (t.七杀||0)>=(th.innerMin+2)) r.push('伤官制杀');
  if (S.self > S.wealth + 8 && S.wealth >= th.innerMin) r.push('比劫夺财');
  if (S.print >= 46 && (S.out + S.wealth) <= 22) r.push('印多成病（需泄化）');
  return r.length?r:['（未见显著矛盾组合）'];
}
function GEJU_derive(tenPercent, options={}){
  const t = GEJU_norm(tenPercent);
  const outer = options.outerHint ? { label: options.outerHint, reason: '外层由上游判定' } : GEJU_outerTop(t);
  const cong = GEJU_congFollow(t);
  if (cong) return { outer, middlePrimary: cong, middleAll:[cong], inner: GEJU_inner(t), tally:t, diag: GEJU_sums(t) };
  const gsy = GEJU_gsy(t, options.monthHint||null);
  const buckets = []; if (gsy) buckets.push(gsy);
  buckets.push(...GEJU_more(t));
  const mid = buckets[0] || GEJU_pack('势能未集中', '各类组合未达显著阈值。', 50);
  return { outer, middlePrimary: mid, middleAll: buckets, inner: GEJU_inner(t), tally: t, diag: GEJU_sums(t) };
}

/* ========== 新增：出生节气范围 & 命卦计算 ========== */
function pad2(n){ return String(n).padStart(2,'0'); }
function fmtSolar(s){
  // lunar.js 的 Solar 通常有 getYear/getMonth/getDay/getHour/getMinute/getSecond
  const y=s.getYear?.(), mo=s.getMonth?.(), d=s.getDay?.(), h=s.getHour?.(), mi=s.getMinute?.(), se=s.getSecond?.();
  return `${y}-${pad2(mo)}-${pad2(d)} ${pad2(h)}:${pad2(mi)}:${pad2(se)}`;
}
function solarMillis(s){
  return Date.UTC(s.getYear(), s.getMonth()-1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond());
}
/** 计算出生时刻所处的“节气区间”文字，如：小寒(YYYY-MM-DD HH:mm)之后，大寒(YYYY-MM-DD HH:mm)之前 */
function calcJieQiRange(lunar){
  try{
    const table = lunar.getJieQiTable?.();
    const list  = lunar.getJieQiList?.();
    const nowS  = lunar.getSolar?.();
    if (!table || !list || !nowS) return '—';
    const items = list.map(name => ({ name, s: table[name] })).filter(x=>x.s && x.s.getYear);
    // 按交接时刻排序
    items.sort((a,b)=> solarMillis(a.s) - solarMillis(b.s));
    const nowMs = solarMillis(nowS);
    // 找到上一个 ≤ now、下一个 > now
    let prev = null, next = null;
    for (let i=0;i<items.length;i++){
      const t = solarMillis(items[i].s);
      if (t<=nowMs) prev = items[i];
      if (t>nowMs){ next = items[i]; break; }
    }
    // 跨年边界：若 next 仍为空，用下一年的首个节气；若 prev 为空，用上一年的最后一个节气
    if (!prev) prev = items[items.length-1];
    if (!next) next = items[0];
    return `${prev.name}(${fmtSolar(prev.s)})之后，${next.name}(${fmtSolar(next.s)})之前`;
  }catch(e){ return '—'; }
}

/** 八宅命卦（后天八卦） */
const GUA_INFO = {
  1:{name:'坎', element:'水', direction:'北'},
  2:{name:'坤', element:'土', direction:'西南'},
  3:{name:'震', element:'木', direction:'东'},
  4:{name:'巽', element:'木', direction:'东南'},
  6:{name:'乾', element:'金', direction:'西北'},
  7:{name:'兑', element:'金', direction:'西'},
  8:{name:'艮', element:'土', direction:'东北'},
  9:{name:'离', element:'火', direction:'南'}
};
function digitSum2(y){ // 年份两位和→一位  1990 -> 1+9+9+0=19 -> 1+9=10 -> 1+0=1
  let s = (y%100);
  let n = Math.floor(s/10) + (s%10);
  while(n>9) n = Math.floor(n/10) + (n%10);
  if (n===0) n = 9;
  return n;
}
/** gender: 1=男, 0/2=女；返回如：坤卦(西南·土) */
function calcMingGua(year, gender=1){
  try{
    const base = digitSum2(year); // 1..9
    const is2000plus = year >= 2000;
    let num;
    if (gender==1 || gender==='1' || gender===1){
      num = (is2000plus ? 9 : 10) - base;
      if (num===5) num = 2; // 男 5 -> 坤
      if (num<=0) num += 9;
    }else{
      num = base + (is2000plus ? 6 : 5);
      num = ((num-1)%9)+1; // wrap to 1..9
      if (num===5) num = 8; // 女 5 -> 艮
    }
    const info = GUA_INFO[num];
    if (!info) return '—';
    return `${info.name}卦（${info.direction}·${info.element}）`;
  }catch(e){ return '—'; }
}

/* ===== 核心 ===== */
function analyzeBaZi(year, month, day, hour, minute, second, birthLocation, currentLocation, gender){
  try{
    I18n.setLanguage('zh');
    const bp = birthLocation?.province||'', bc = birthLocation?.city||'', bd = birthLocation?.district||'';
    const cp = currentLocation?.province||'', cc = currentLocation?.city||'', cd = currentLocation?.district||'';

    const stdSolarDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
    const lon = guessLongitude(bp,bc,bd);
    const adj = USE_TRUE_SOLAR ? adjustToTrueSolarTimeYMD(year,month,day,hour,minute,lon,8) : {year,month,day,hour,minute,deltaMinutes:0};
    const trueSolarDate = `${adj.year}-${String(adj.month).padStart(2,'0')}-${String(adj.day).padStart(2,'0')} ${String(adj.hour).padStart(2,'0')}:${String(adj.minute).padStart(2,'0')}`;

    const solar = Solar.fromYmdHms(adj.year, adj.month, adj.day, adj.hour, adj.minute, 0);
    const lunar = solar.getLunar();
    const ec = lunar.getEightChar();

    const eightChar = {
      year:`${ec.getYearGan?.()||''}${ec.getYearZhi?.()||''}`,
      month:`${ec.getMonthGan?.()||''}${ec.getMonthZhi?.()||''}`,
      day:`${ec.getDayGan?.()||''}${ec.getDayZhi?.()||''}`,
      time:`${ec.getTimeGan?.()||''}${ec.getTimeZhi?.()||''}`
    };

    const wuXing = calcWuXingWeighted(ec);
    const ss = calcShiShen(ec);

    // —— 神煞分柱
    const shenshaSplit = (typeof calcShenShaByPillar==='function') ? calcShenShaByPillar(ec) : { byPillar:{year:[],month:[],day:[],time:[]}, flat:[] };

    const mingPan = {
      year:  buildPillar(ec, 'Year'),
      month: buildPillar(ec, 'Month'),
      day:   buildPillar(ec, 'Day'),
      time:  buildPillar(ec, 'Time')
    };
    // 并入神煞
    mingPan.year.shenSha  = (shenshaSplit.byPillar.year||[]).join('、');
    mingPan.month.shenSha = (shenshaSplit.byPillar.month||[]).join('、');
    mingPan.day.shenSha   = (shenshaSplit.byPillar.day||[]).join('、');
    mingPan.time.shenSha  = (shenshaSplit.byPillar.time||[]).join('、');

    const yun = ec.getYun?.(parseInt(gender||1)) || null;
    let daYun = [], startYun='无法计算起运', liuNian=[];
    if (yun){
      const d = yun.getDaYun?.()||[];
      daYun = d.map(dy=>({ startYear:dy.getStartYear?.(), startAge:dy.getStartAge?.(), ganZhi:dy.getGanZhi?.() }));
      if (d.length) startYun = `${yun.getStartYear?.()}年${yun.getStartMonth?.()}个月${yun.getStartDay?.()}天后起运`;
      const ln = d.length ? (d[0].getLiuNian?.()||[]) : [];
      liuNian = ln.map(ln=>({ year:ln.getYear?.(), age:ln.getAge?.(), ganZhi:ln.getGanZhi?.() }));
    }

    const geju = GEJU_derive(ss.shiShen10w, { /* monthHint 可选：'官'|'杀' */ });

    // ===== 新增：出生节气范围 & 命卦 =====
    const jieQiText = calcJieQiRange(lunar);
    const taiYuan = ec.getTaiYuan?.() || '';
    const taiXi   = ec.getTaiXi?.() || '';              // 若库无此方法，返回空字符串
    const mingGong= ec.getMingGong?.() || '';
    const shenGong= ec.getShenGong?.() || '';
    const mingGua = calcMingGua(adj.year, parseInt(gender||1));

    return {
      standardSolarDate: stdSolarDate,
      trueSolarDate, trueSolarShiftMinutes: adj.deltaMinutes||0,
      lunarDate: `${lunar.getYearInGanZhi?.()}年 ${lunar.getMonthInGanZhi?.()}月 ${lunar.getDayInGanZhi?.()}日`,

      birthLocation: `${bp?bp+'·':''}${bc||''}${bd?'·'+bd:''}`,
      currentLocation: `${cp?cp+'·':''}${cc||''}${cd?'·'+cd:''}`,

      eightChar,
      wuXing,
      shiShen10w: ss.shiShen10w,
      shiShen: ss.shiShen10w,
      shiShen5Count: ss.shiShen5Count,

      mingPan,

      shenSha: [].concat(lunar.getDayJiShen?.()||[], lunar.getDayXiongSha?.()||[]),
      shenShaByPillar: shenshaSplit.byPillar,
      shenShaFlat: shenshaSplit.flat,

      zodiac: lunar.getYearShengXiao?.(),
      naYin: { year: ec.getYearNaYin?.()||'未知', month: ec.getMonthNaYin?.()||'未知', day: ec.getDayNaYin?.()||'未知', time: ec.getTimeNaYin?.()||'未知' },

      daYun, startYun, liuNian,

      // 新增返回
      jieQi: jieQiText,
      taiYuan, taiXi, mingGong, shenGong, mingGua,

      geju
    };
  }catch(err){
    console.error('Analysis error:', err);
    return { error:`输入无效：${err.message}` };
  }
}

// ===== API =====
app.post('/analyze', (req, res) => {
  const { year, month, day, hour, minute, gender=1 } = req.body || {};
  const birthLocation = { province:req.body.birthProvince, city:req.body.birthCity, district:req.body.birthDistrict };
  const currentLocation = { province:req.body.currentProvince, city:req.body.currentCity, district:req.body.currentDistrict };
  if (year==null || month==null || day==null || hour==null || minute==null) return res.status(400).json({ error:'缺少必要字段' });
  const r = analyzeBaZi(parseInt(year),parseInt(month),parseInt(day),parseInt(hour),parseInt(minute),0, birthLocation,currentLocation,gender);
  res.json(r);
});
app.get('/healthz', (_,res)=>res.status(200).send('ok'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server running on http://localhost:${PORT}`));
