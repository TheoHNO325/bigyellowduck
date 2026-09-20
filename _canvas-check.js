// 临时自检脚本：模拟 DOM/canvas 环境运行页面脚本，捕捉运行时报错
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.log('NO SCRIPT FOUND'); process.exit(1); }
const code = m[1];

// 语法检查
try { new Function(code); console.log('SYNTAX OK'); }
catch (e) { console.log('SYNTAX ERROR:', e.message); process.exit(1); }

const gradient = { addColorStop() {} };
const ctxStub = {
  setTransform(){}, clearRect(){}, fillRect(){}, beginPath(){}, moveTo(){},
  lineTo(){}, quadraticCurveTo(){}, closePath(){}, fill(){}, stroke(){},
  save(){}, restore(){}, translate(){}, rotate(){}, arc(){},
  createLinearGradient(){ return gradient; },
  createRadialGradient(){ return gradient; },
};
const classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
const canvasStub = { width: 0, height: 0, getContext(){ return ctxStub; } };
const els = { scene: canvasStub, colophon: { classList }, toggle: { addEventListener(){}, classList } };

let frames = 0;
global.window = {
  innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1,
  addEventListener(){},
  matchMedia(){ return { matches: false }; },
};
global.document = { getElementById(id){ return els[id] || { classList }; } };
global.performance = { now(){ return Date.now(); } };
global.requestAnimationFrame = function(cb){ if (frames++ < 3) cb(frames * 16); };

try {
  (0, eval)(code);
  console.log('RUNTIME OK — drew', frames, 'frame(s)');
} catch (e) {
  console.log('RUNTIME ERROR:', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  process.exit(1);
}
