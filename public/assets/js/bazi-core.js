// assets/js/bazi-core.js
;(function(window) {
  /**
   * 简易版八字分析，配合上面那个 mock lunar.js 使用
   */
  function analyzeBazi({ year, month, day, hour, minute, province, city, district }) {
    // —— 1. 构造 Lunar —— 
    const lunar = Lunar.fromYmd(year, month, day);

    // —— 2. 四柱干支 —— 
    const yearPillar  = lunar.getYearInGanZhi();
    const monthPillar = lunar.getMonthInGanZhi();
    const dayPillar   = lunar.getDayInGanZhi();
    const hourPillar  = lunar.getTimeInGanZhi(hour, minute);

    // —— 3. 五行分布 —— 
    // 直接用 getBaZiWuXing()
    const wuxingPairs = lunar.getBaZiWuXing();
    const counts = { 木:0, 火:0, 土:0, 金:0, 水:0 };
    wuxingPairs.forEach(pair => {
      counts[pair[0]]++;
      counts[pair[1]]++;
    });
    const total = 8;
    const wuxing = {
      wood:  Math.round(counts.木  / total * 100),
      fire:  Math.round(counts.火  / total * 100),
      earth: Math.round(counts.土  / total * 100),
      metal: Math.round(counts.金  / total * 100),
      water: Math.round(counts.水  / total * 100),
    };

    // —— 4. 神煞列表 —— 
    // 用 mock 的 getEightChar().getShenSha()
    const shensha = lunar.getEightChar().getShenSha();

    // —— 5. 十神占比 —— 
    // 用 mock 的 getEightChar().getShiShen()
    const shiShenList = lunar.getEightChar().getShiShen();
    const tenGods = {};
    shiShenList.forEach(name => {
      tenGods[name] = (tenGods[name] || 0) + 1;
    });
    Object.keys(tenGods).forEach(k => {
      tenGods[k] = Math.round(tenGods[k] / shiShenList.length * 100);
    });

    // —— 6. 格局 & 外格/内格 —— 
    // 这里用简单占位，或者你自行改成真实逻辑
    const pattern = {
      name:        '示例格局',
      description: '五行演示模式',
      waiGe:       '外格示例',
      neiGe:       '内格示例',
    };

    return {
      birth:    { year, month, day, hour, minute, province, city, district },
      pillars:  { yearPillar, monthPillar, dayPillar, hourPillar },
      wuxing,
      shensha,
      tenGods,
      pattern
    };
  }

  // 暴露全局
  window.analyzeBazi = analyzeBazi;
})(window);
