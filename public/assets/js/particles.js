// assets/js/particles.js
;(function() {
  // 获取 canvas
  const canvas = document.getElementById('particle-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H;

  // 自适应画布
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // Web Audio API 初始化
  const audio = document.getElementById('bgMusic');
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  const src      = audioCtx.createMediaElementSource(audio);
  const analyser = audioCtx.createAnalyser();
  src.connect(analyser);
  analyser.connect(audioCtx.destination);
  analyser.fftSize = 512;                          // 512 点 FFT -> 256 bins
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  // 点击任意解锁并播放
  document.body.addEventListener('click', () => {
    if (audioCtx.state !== 'running') audioCtx.resume();
    if (audio.paused) audio.play();
  });

  // 主循环
  function draw() {
    ctx.clearRect(0, 0, W, H);

    analyser.getByteFrequencyData(freqData);

    const N       = freqData.length;               // 256 根条带
    const barW    = W / N;
    const centerX = W / 2;
    const maxPct  = 0.3;  // 最大高度 30%
    const minPct  = 0.0; // 最低高度 2%

    // 正序取：i=0 低频→居中，i越大频率越高→越往两侧
    for (let i = 0; i < N; i++) {
      const v       = freqData[i] / 255;
      const h       = (minPct + v * (maxPct - minPct)) * H;
      const step    = Math.ceil(i / 2);
      const dir     = (i % 2 === 0 ? 1 : -1);
      const x       = centerX + dir * step * barW - barW/2;
      const y       = H - h;

      const grad = ctx.createLinearGradient(0, H, 0, y);
      grad.addColorStop(0, 'rgba(255,220,100,0.9)');
      grad.addColorStop(1, 'rgba(255,100,0,0.2)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barW * 0.8, h);
    }

    requestAnimationFrame(draw);
  }

  draw();
})();
