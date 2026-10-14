/**
 * Writes research/results/mobile-timing.html: one self-contained page that times the real Attestor
 * Module on whatever device opens it (500 runs each on 20, 50 and 500-element consent regions) and
 * shows the result as JSON to copy back. It is the only way to get a mobile figure; nothing in the
 * repository pretends to have one until this has been run on a physical phone.
 *
 *   node research/harness/make-mobile-page.cjs
 *   (serve research/results/ on the phone's localhost, e.g. `adb reverse tcp:8099 tcp:8099`,
 *    then open http://localhost:8099/mobile-timing.html -- the Web Crypto API needs a secure
 *    context, and http://localhost is one; a plain LAN address is not)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const attestor = fs.readFileSync(path.join(ROOT, 'attestor/dist/mra-attestor-1.0.0.js'), 'utf8');

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>MRA digest timing</title>
<style>body{font:16px system-ui;margin:16px}button{font-size:18px;padding:10px 16px}
pre{white-space:pre-wrap;word-break:break-all;background:#eee;padding:8px}#stage{margin-top:16px}</style></head>
<body><h1>MRA digest timing</h1><p>Times the real Attestor Module on this device.</p>
<button id="go">Run (500 runs per size)</button><pre id="out">not run</pre><div id="stage"></div>
<script>${attestor.replace(/<\/script>/gi, '<\\/script>')}</script>
<script>
function html(n){var p=[];for(var i=0;i<n;i++){var k=i%5;
 p.push(k===0?'<p>Vendor '+i+' may process your data for purpose '+i+'.</p>':k===1?'<a href="#v'+i+'">Notice of vendor '+i+'</a>':
 k===2?'<label><input type="checkbox"> Allow purpose '+i+'</label>':k===3?'<h3>Purpose '+i+'</h3>':'<button type="button">Details '+i+'</button>');}
 return '<div id="consent-region">'+p.join('')+'<button type="button">Accept</button><button type="button">Reject</button></div>';}
function pct(v,p){v=v.slice().sort(function(a,b){return a-b});return v[Math.min(v.length-1,Math.floor(p*v.length))]}
document.getElementById('go').onclick=async function(){
 var out=document.getElementById('out'),stage=document.getElementById('stage'),res={ua:navigator.userAgent,cores:navigator.hardwareConcurrency,memory_gb:navigator.deviceMemory||null,sizes:{}};
 for(var n of [20,50,500]){out.textContent='running '+n+' elements...';stage.innerHTML=html(n);
  var t=[],nodes=null;
  for(var i=0;i<520;i++){var a=performance.now();var ev=await MRAttestor.attest({regionSelector:'#consent-region'});var b=performance.now();if(i>=20)t.push(b-a);nodes=ev.region_nodes;}
  res.sizes[n]={region_nodes:nodes,runs:t.length,p50_ms:+pct(t,.5).toFixed(2),p95_ms:+pct(t,.95).toFixed(2),p99_ms:+pct(t,.99).toFixed(2),max_ms:+Math.max.apply(null,t).toFixed(2)};}
 stage.innerHTML='';out.textContent=JSON.stringify(res,null,1);};
</script></body></html>`;

const outFile = path.join(ROOT, 'research/results/mobile-timing.html');
fs.writeFileSync(outFile, page);
console.log('wrote', path.relative(ROOT, outFile), `(${Math.round(page.length / 1024)} KB)`);
