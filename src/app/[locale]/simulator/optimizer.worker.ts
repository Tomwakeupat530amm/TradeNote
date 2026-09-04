import { OptimizerParams, SimResult, StratRow } from './useOptimizer';

self.onmessage = (event: MessageEvent) => {
  const { type, payload, msgId } = event.data;

  if (type === 'RUN_OPTIMIZER') {
    const params: OptimizerParams = payload;
    const { bal, tgtE, tgtP, dd, ec, wr, rrv, dRisk, maxT, ds, dt, tpd, conc, sv, smn, smx, sst } = params;
    const tpa = Math.max(1, Math.ceil(tpd / conc));
    const steps: number[] = [];
    for (let v = smn; v <= smx; v = Math.round((v + sst) * 1e6) / 1e6) steps.push(v);

    const resArr: SimResult[] = [];
    const nSim = 5000;

    for (let i = 0; i < steps.length; i++) {
      const stepVal = steps[i];
      const risk = sv === 'risk' ? stepVal : dRisk;
      const wr2 = sv === 'wr' ? stepVal / 100 : wr;
      const rr2 = sv === 'rr' ? stepVal : rrv;
      const ev = (wr2 * (risk * rr2)) - ((1 - wr2) * risk);
      let ep = 0, pp = 0, bc = 0, te = 0, me = 999999, tp = 0, mp = 999999;

      for (let j = 0; j < nSim; j++) {
        let b = bal, pk = bal, md = 0, dp = 0, ep2 = 0, bu = false;
        for (let t = 1; t <= maxT; t++) {
          const pn = Math.random() < wr2 ? risk * rr2 : -risk;
          b += pn; dp += pn; if (b > pk) pk = b;
          if (b <= pk - dd) { bu = true; break; }
          if (b >= bal + tgtE) {
            const cm = Math.max(md, dp);
            if (ec === 0 || cm <= (b - bal) * ec) { ep2 = t; break; }
          }
          if (t % tpa === 0) { if (dp > md) md = dp; dp = 0; }
          else {
            if (ds > 0 && dp <= -ds) { if (dp > md) md = dp; dp = 0; }
            else if (dt > 0 && dp >= dt) { if (dp > md) md = dp; dp = 0; }
          }
        }
        if (bu) bc++;
        else if (ep2 > 0) {
          ep++; te += ep2; if (ep2 < me) me = ep2;
          b = bal; pk = bal; md = 0; dp = 0; let pp2 = false;
          for (let t = 1; t <= maxT - ep2; t++) {
            const pn = Math.random() < wr2 ? risk * rr2 : -risk;
            b += pn; dp += pn; if (b > pk) pk = b;
            if (b <= pk - dd) { bu = true; break; }
            if (b >= bal + tgtP) { pp2 = true; tp += t; if (t < mp) mp = t; break; }
            if (t % tpa === 0) { if (dp > md) md = dp; dp = 0; }
            else {
              if (ds > 0 && dp <= -ds) { if (dp > md) md = dp; dp = 0; }
              else if (dt > 0 && dp >= dt) { if (dp > md) md = dp; dp = 0; }
            }
          }
          if (pp2) pp++; else if (bu) bc++;
        } else { bc++; }
      }

      resArr.push({
        val: stepVal,
        eval_rate: ep / nSim * 100,
        payout_rate: pp / nSim * 100,
        bust_rate: bc / nSim * 100,
        eval_avg: ep > 0 ? Math.round(te / ep) : 0,
        eval_min: ep > 0 ? me : '--',
        payout_avg: pp > 0 ? Math.round(tp / pp) : 0,
        payout_min: pp > 0 ? mp : '--',
        ev
      });

      if (i % 2 === 0 || i === steps.length - 1) {
        self.postMessage({ type: 'PROGRESS', msgId, progress: Math.round(((i + 1) / steps.length) * 100) });
      }
    }

    let bi = -1, bs = -999999;
    resArr.forEach((r, i) => {
      const s = r.ev * r.payout_rate;
      if (s > bs && r.bust_rate < 50) { bs = s; bi = i; }
    });
    
    self.postMessage({ type: 'DONE', msgId, results: resArr, bestIndex: bi });
  } 
  
  else if (type === 'GET_STRATIFIED') {
    const { r, params } = payload;
    const { bal, tgtP, dd, wr, rrv, ds, dt, tpd, conc, smn, smx, sst } = params;
    const tpa = Math.max(1, Math.ceil(tpd / conc));
    const p1 = r.val;
    const p2s: number[] = [];
    for (let v = smn; v <= smx; v = Math.round((v + sst) * 1e6) / 1e6) {
      if (v !== p1) p2s.push(v);
    }
    const ht = tgtP * 0.5, nSim = 1500;
    const srs: StratRow[] = [];
    for (const p2 of p2s) {
      let pc = 0, nf = 0, tt = 0;
      for (let i = 0; i < nSim; i++) {
        let b = bal, pk = bal, md = 0, dp = 0, bu = false, pa = false, tr = 0;
        for (let t = 1; t <= 500; t++) {
          tr++;
          const pn = Math.random() < wr ? p1 * rrv : -p1;
          b += pn; dp += pn; if (b > pk) pk = b;
          if (b <= pk - dd) { bu = true; break; }
          if (b >= bal + ht) { pa = true; break; }
          if (t % tpa === 0) { if (dp > md) md = dp; dp = 0; }
          else {
            if (ds > 0 && dp <= -ds) { if (dp > md) md = dp; dp = 0; }
            else if (dt > 0 && dp >= dt) { if (dp > md) md = dp; dp = 0; }
          }
        }
        if (bu || !pa) continue;
        nf++; md = 0; dp = 0;
        for (let t = 1; t <= 500; t++) {
          tr++;
          const pn = Math.random() < wr ? p2 * rrv : -p2;
          b += pn; dp += pn; if (b > pk) pk = b;
          if (b <= pk - dd) break;
          if (b >= bal + tgtP) { pc++; tt += tr; break; }
          if (t % tpa === 0) { if (dp > md) md = dp; dp = 0; }
          else {
            if (ds > 0 && dp <= -ds) { if (dp > md) md = dp; dp = 0; }
            else if (dt > 0 && dp >= dt) { if (dp > md) md = dp; dp = 0; }
          }
        }
      }
      const sv = nf > 0 ? pc / nf * 100 : 0;
      const pr = pc / nSim * 100;
      const at = pc > 0 ? Math.round(tt / pc) : 0;
      srs.push({ p2, sv, pr, at });
    }
    srs.sort((a, b) => b.pr - a.pr);
    self.postMessage({ type: 'STRATIFIED_DONE', msgId, results: srs });
  }
};
