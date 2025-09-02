'use strict';
const fs = require('fs/promises');
const path = require('path');
const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

(async () => {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  const slugs = ['', 'demo', 'test'];
  const themes = ['light', 'dark'];

  const outDirScreens = path.resolve('screenshots');
  const outDirAudits = path.resolve('audits');
  await fs.mkdir(outDirScreens, { recursive: true });
  await fs.mkdir(outDirAudits, { recursive: true });

  const results = { base, startedAt: new Date().toISOString(), pages: [] };

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 900, height: 1200 },
    args: ['--no-sandbox','--disable-setuid-sandbox']
  });

  try {
    for (const slug of slugs) {
      const label = slug === '' ? 'root' : slug;
      const url = base + (slug === '' ? '/' : `/${slug}`);
      const page = await browser.newPage();

      let consoleLogs = [];
      let runtimeErrors = [];
      let requestFailed = [];

      page.on('console', (msg)=> {
        try { consoleLogs.push(`[${msg.type()}] ${msg.text()}`); } catch {}
      });
      page.on('pageerror', (err)=> runtimeErrors.push(String(err)));
      page.on('requestfailed', (req)=> {
        const failure = req.failure();
        requestFailed.push(`[${(failure && failure.errorText) || 'fail'}] ${req.url()}`);
      });

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await sleep(600);
      } catch (e) {
        runtimeErrors.push(`Navigation error: ${String(e)}`);
      }

      const pageEntry = { path: slug === '' ? '/' : `/${slug}`, url, themes: {} };

      for (const theme of themes) {
        await page.evaluate((th)=> {
          const root = document.documentElement;
          root.classList.remove('light','dark');
          root.classList.add(th);
        }, theme);
        await sleep(250);

        const full = path.join(outDirScreens, `${label}-${theme}-full.png`);
        const main = path.join(outDirScreens, `${label}-${theme}-main.png`);
        try {
          await page.screenshot({ path: full, fullPage: true });
        } catch(e) { runtimeErrors.push(`Full screenshot error (${theme}): ${String(e)}`); }
        try {
          const mainEl = await page.$('main, [role="main"]');
          if (mainEl) {
            await mainEl.screenshot({ path: main });
          } else {
            await page.screenshot({ path: main });
          }
        } catch(e) { runtimeErrors.push(`Main screenshot error (${theme}): ${String(e)}`); }

        const audit = await page.evaluate((pathname, theme) => {
          function normalizeRgbString(str){ if(!str)return ''; const m=str.match(/rgba?\(([^)]+)\)/i); if(!m) return str.trim(); const parts=m[1].trim().split(/[\s,\/]+/).filter(Boolean); let [r,g,b,a]=parts; const to255=(v)=>{ if(typeof v==='undefined') return 0; v=String(v).trim(); if(v.endsWith('%')) return Math.round(parseFloat(v)*2.55); return Math.round(parseFloat(v)); }; r=to255(r); g=to255(g); b=to255(b); a=typeof a==='undefined'?1:parseFloat(a); if(Number.isNaN(a)) a=1; return `rgba(${r}, ${g}, ${b}, ${a})`; }
          function parseRgba(str){ const m=normalizeRgbString(str).match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/i); if(!m) return null; return { r:+m[1], g:+m[2], b:+m[3], a:+m[4] }; }
          function sRGBtoLin(c){ c=c/255; return c<=0.04045? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }
          function luminance(rgb){ const r=sRGBtoLin(rgb.r); const g=sRGBtoLin(rgb.g); const b=sRGBtoLin(rgb.b); return 0.2126*r + 0.7152*g + 0.0722*b; }
          function contrast(rgb1,rgb2){ const L1=luminance(rgb1); const L2=luminance(rgb2); const lighter=Math.max(L1,L2); const darker=Math.min(L1,L2); return (lighter+0.05)/(darker+0.05); }
          function visible(el){ const cs=getComputedStyle(el); if(cs.visibility==='hidden' || cs.display==='none') return false; const rect=el.getBoundingClientRect(); if(rect.width<=0 || rect.height<=0) return false; const txt=(el.textContent||'').trim(); if(txt.length<2) return false; return true; }
          function effectiveBg(el){ let cur=el; while(cur){ const cs=getComputedStyle(cur); const bgc=cs.backgroundColor; const rgba=parseRgba(bgc); if(rgba && rgba.a>0.01) { return normalizeRgbString(bgc); } cur=cur.parentElement; } return normalizeRgbString(getComputedStyle(document.body).backgroundColor); }
          function buildShortSelector(el){ const tag=el.tagName.toLowerCase(); const id=el.id ? '#'+el.id : ''; let cls=''; if(el.classList && el.classList.length){ const arr=Array.from(el.classList).slice(0,3); if(arr.length) cls='.'+arr.join('.'); } return tag+id+cls; }
          function trimHtml(s){ s=(s||'').replace(/\s+/g,' ').trim(); return s.length>240? s.slice(0,240)+'…' : s; }
          const varNames=['--color-foreground','--color-background','--color-muted','--color-muted-foreground','--color-card','--color-card-foreground','--color-border','--color-accent','--color-accent-foreground','--color-destructive','--color-destructive-foreground','--color-success','--color-success-foreground','--color-warning','--color-warning-foreground'];
          const tmp=document.createElement('div'); document.body.appendChild(tmp); const varMap={};
          for(const vn of varNames){ try{ tmp.style.color=`hsl(var(${vn}))`; const c=getComputedStyle(tmp).color; varMap[vn]=normalizeRgbString(c); } catch(e){} }
          document.body.removeChild(tmp);
          const findVar=(rgbaStr)=>{ const n=normalizeRgbString(rgbaStr); for(const [vn,val] of Object.entries(varMap)){ if(normalizeRgbString(val)===n) return vn; } return null; };
          const nodes=Array.from(document.querySelectorAll('body *')).filter(visible);
          let checked=0, fail45=0, fail30=0; const offenders=[];
          for(const el of nodes){ const cs=getComputedStyle(el); const fgStr=normalizeRgbString(cs.color); const bgStr=effectiveBg(el); const fg=parseRgba(fgStr); const bg=parseRgba(bgStr); if(!fg || !bg) continue; const ratio=contrast(fg,bg); checked++; if(ratio<4.5){ fail45++; if(ratio<3.0) fail30++; offenders.push({ pagePath: pathname, theme, selector: buildShortSelector(el), fg: fgStr, bg: bgStr, ratio: Math.round(ratio*100)/100, fgVar: findVar(fgStr), bgVar: findVar(bgStr), outerHTML: trimHtml(el.outerHTML) }); } }
          offenders.sort((a,b)=>a.ratio-b.ratio);
          return { counts:{ checked, failingUnder4_5: fail45, failingUnder3_0: fail30 }, top12: offenders.slice(0,12) };
        }, (slug === '' ? '/' : `/${slug}`), theme);

        pageEntry.themes[theme] = {
          screenshots: {
            full: path.posix.join('screenshots', `${label}-${theme}-full.png`),
            main: path.posix.join('screenshots', `${label}-${theme}-main.png`)
          },
          logs: { console: consoleLogs.slice(), runtimeErrors: runtimeErrors.slice(), requestFailed: requestFailed.slice() },
          audit
        };

        consoleLogs = [];
        runtimeErrors = [];
        requestFailed = [];
      }

      results.pages.push(pageEntry);
      await page.close();
    }

    let totalChecked=0, totalFail45=0, totalFail30=0; let allOffenders=[];
    for(const p of results.pages){
      for(const th of Object.values(p.themes)){
        totalChecked += th.audit.counts.checked;
        totalFail45 += th.audit.counts.failingUnder4_5;
        totalFail30 += th.audit.counts.failingUnder3_0;
        allOffenders = allOffenders.concat(th.audit.top12);
      }
    }
    allOffenders.sort((a,b)=>a.ratio-b.ratio);
    results.aggregate = {
      counts: { checked: totalChecked, failingUnder4_5: totalFail45, failingUnder3_0: totalFail30 },
      top12: allOffenders.slice(0,12)
    };

    await fs.writeFile(path.join(outDirAudits,'audit-summary.json'), JSON.stringify(results,null,2), 'utf8');
    console.log('WROTE audits/audit-summary.json');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('PUPPETEER_AUDIT_ERROR', e); process.exit(1); });