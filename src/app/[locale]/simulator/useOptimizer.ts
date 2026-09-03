'use client';

import { useState, useCallback, useRef } from 'react';

export interface SimResult {
  val: number;
  eval_rate: number;
  payout_rate: number;
  bust_rate: number;
  eval_avg: number;
  eval_min: number | string;
  payout_avg: number;
  payout_min: number | string;
  ev: number;
}

export interface BizResult {
  setupEvals: number;
  en: number;
  fs: number;
  np: number;
  fd: number;
  ex: number;
  rv: number;
  pr2: number;
  roi: number;
  breakeven: number;
  costFunded: number;
  multiplier: number;
  annual: number;
}

export interface StratRow {
  p2: number;
  sv: number;
  pr: number;
  at: number;
}

export interface AnalysisRow {
  r: SimResult;
  setupEvals: number;
  setupCost: number;
  pr2: number;
}

export interface WorkflowSlot {
  bal: number;
  peak: number;
  pnl: number;
  phase: string;
  busts: number;
  payouts: number;
}

export interface WorkflowSummary {
  days: number;
  evalPassCount: number;
  totBust: number;
  totPayout: number;
  fundedEnd: number;
  conc: number;
  psize: number;
  logRows: { day: number; blocks: string[] }[];
}

export interface PayoutRule {
  tp: number;
  ps: number;
  fc: number;
  md: number;
}

export interface Preset {
  b: number;
  te: number;
  dd: number;
  dt: string;
  ec: number;
  payoutRule?: Record<string, PayoutRule>;
}

export const PRESETS: Record<string, Preset> = {
  topstep50: {
    b: 50000, te: 3000, dd: 2000, dt: 'trailing', ec: 50,
    payoutRule: { standard: { tp: 3000, ps: 2000, fc: 0, md: 5 }, consistency: { tp: 3000, ps: 3000, fc: 40, md: 3 } }
  },
  topstep100: {
    b: 100000, te: 6000, dd: 3000, dt: 'trailing', ec: 50,
    payoutRule: { standard: { tp: 3000, ps: 3000, fc: 0, md: 5 }, consistency: { tp: 4000, ps: 4000, fc: 40, md: 3 } }
  },
  topstep150: {
    b: 150000, te: 9000, dd: 4500, dt: 'trailing', ec: 50,
    payoutRule: { standard: { tp: 5000, ps: 5000, fc: 0, md: 5 }, consistency: { tp: 6000, ps: 6000, fc: 40, md: 3 } }
  },
  blx50: {
    b: 50000, te: 3000, dd: 2500, dt: 'trailing', ec: 40,
    payoutRule: { standard: { tp: 3000, ps: 2000, fc: 0, md: 10 }, consistency: { tp: 3000, ps: 3000, fc: 40, md: 10 } }
  },
  blx100: {
    b: 100000, te: 6000, dd: 3000, dt: 'trailing', ec: 40,
    payoutRule: { standard: { tp: 3000, ps: 3000, fc: 0, md: 10 }, consistency: { tp: 4000, ps: 4000, fc: 40, md: 10 } }
  }
};

export interface OptimizerParams {
  bal: number; tgtE: number; tgtP: number; dd: number; ec: number;
  wr: number; rrv: number; dRisk: number; maxT: number; ds: number; dt: number;
  tpd: number; conc: number; sv: string; smn: number; smx: number; sst: number;
}

export interface BizParams {
  tpd: number; conc: number; fee: number; psize: number; minD: number; pending: number;
}

export function useOptimizer() {
  const [isCalculating, setIsCalculating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SimResult[]>([]);
  const [bestIndex, setBestIndex] = useState(-1);
  const cachedResults = useRef<SimResult[]>([]);

  const runOptimizer = useCallback(async (params: OptimizerParams) => {
    setIsCalculating(true);
    setProgress(0);

    const { bal, tgtE, tgtP, dd, ec, wr, rrv, dRisk, maxT, ds, dt, tpd, conc, sv, smn, smx, sst } = params;
    const tpa = Math.max(1, Math.ceil(tpd / conc));
    const steps: number[] = [];
    for (let v = smn; v <= smx; v = Math.round((v + sst) * 1e6) / 1e6) steps.push(v);

    const resArr: SimResult[] = [];
    const nSim = 5000;

    const batch = (stepVal: number): Promise<SimResult | null> =>
      new Promise(resolve => setTimeout(() => {
        try {
          const risk = sv === 'risk' ? stepVal : dRisk;
          const wr2 = sv === 'wr' ? stepVal / 100 : wr;
          const rr2 = sv === 'rr' ? stepVal : rrv;
          const ev = (wr2 * (risk * rr2)) - ((1 - wr2) * risk);
          let ep = 0, pp = 0, bc = 0, te = 0, me = 999999, tp = 0, mp = 999999;

          for (let i = 0; i < nSim; i++) {
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

          resolve({
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
        } catch (e) { console.error(e); resolve(null); }
      }, 0));

    for (let i = 0; i < steps.length; i++) {
      setProgress(Math.round(i / steps.length * 100));
      const r = await batch(steps[i]);
      if (r) resArr.push(r);
    }

    setIsCalculating(false);
    setResults(resArr);
    cachedResults.current = resArr;

    let bi = -1, bs = -999999;
    resArr.forEach((r, i) => {
      const s = r.ev * r.payout_rate;
      if (s > bs && r.bust_rate < 50) { bs = s; bi = i; }
    });
    setBestIndex(bi);
    return { resArr, bi };
  }, []);

  const calculateBiz = useCallback((er: number, pr: number, ae: number, ap: number, bizParams: BizParams): BizResult => {
    const { tpd, conc, fee, psize, minD, pending } = bizParams;
    const TRAD = 22;
    const tpa = Math.max(1, Math.ceil(tpd / conc));
    const fs = er > 0 ? Math.min(1, pr / er) : 0;
    const rawFd = ap > 0 ? ap / tpa : 0, fd = rawFd > 0 ? Math.max(rawFd, minD) : minD;
    const fc = TRAD / fd;
    const nb = conc * fc * (1 - fs), np = conc * fc * fs;
    const ev2 = Math.ceil(1 / er) || 1, br = Math.ceil(nb), en = br * ev2;
    const setupEvals = Math.ceil((conc + pending) / er) || (conc + pending);
    const totalEvals = setupEvals + en;
    const ex = totalEvals * fee, rv = np * psize, pr2 = rv - ex, roi = ex > 0 ? pr2 / ex * 100 : 0;
    return {
      setupEvals, en, fs, np, fd, ex, rv, pr2, roi,
      breakeven: Math.ceil(ex / psize) || 0,
      costFunded: Math.ceil(totalEvals * fee / conc) || 0,
      multiplier: ex > 0 ? rv / ex : 0,
      annual: pr2 * 12
    };
  }, []);

  const computeProfit = useCallback((r: SimResult, bizParams: BizParams): number => {
    const er = r.eval_rate / 100, pp = r.payout_rate / 100;
    const ae = r.eval_avg || 0, ap = r.payout_avg || 0;
    const biz = calculateBiz(er, pp, ae, ap, bizParams);
    return biz.pr2;
  }, [calculateBiz]);

  const getStratified = useCallback((
    r: SimResult,
    params: OptimizerParams
  ): Promise<StratRow[]> => {
    return new Promise(resolve => setTimeout(() => {
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
      resolve(srs);
    }, 20));
  }, []);

  const renderWorkflow = useCallback((
    risk: number,
    params: OptimizerParams,
    bizParams: BizParams
  ): WorkflowSummary => {
    const { bal: bal0, dd, tgtE: tgt, wr, rrv, ds, dt } = params;
    const { tpd: total_tpd, conc, psize, pending } = bizParams;
    const tpa = Math.max(1, Math.ceil(total_tpd / conc));
    const win = risk * rrv;

    const slots: WorkflowSlot[] = [];
    for (let i = 0; i < conc; i++) slots.push({ bal: bal0, peak: bal0, pnl: 0, phase: 'FUNDED', busts: 0, payouts: 0 });
    let pendingPool = pending;
    let evalPassCount = 0;

    let evalPassRate = 0.5;
    if (cachedResults.current.length) {
      const hit = cachedResults.current.find(r => r.val === risk);
      if (hit) evalPassRate = hit.eval_rate / 100;
    }

    const logRows: { day: number; blocks: string[] }[] = [];
    const MAX_DAYS = 20;

    for (let day = 1; day <= MAX_DAYS; day++) {
      let dayActive = false;
      const dayBlocks: string[] = [];
      slots.forEach((s, i) => {
        if (s.phase === 'DONE') return;
        dayActive = true;
        const lines: string[] = [];
        for (let t = 0; t < tpa; t++) {
          const isWin = Math.random() < wr;
          const pnl = isWin ? win : -risk;
          s.bal += pnl; s.pnl += pnl; s.peak = Math.max(s.peak, s.bal);
          lines.push(`   TK${i + 1} ${s.phase} · Lệnh ${t + 1}: ${isWin ? '✅ WIN +$' + win : '❌ LOSS -$' + risk} → BTN $${Math.round(s.bal).toLocaleString()}`);
          if (s.bal <= s.peak - dd) {
            s.busts++;
            let src = '';
            if (pendingPool > 0) { pendingPool--; src = `activate 1 pass pending (còn ${pendingPool})`; }
            else { src = 'hết pending, chờ eval mới'; }
            if (evalPassRate > 0) {
              for (let k = 0; k < 6; k++) {
                if (Math.random() < evalPassRate) { pendingPool++; evalPassCount++; break; }
              }
            }
            lines.push(`   💥 TK${i + 1} BUST → ${src}`);
            if (src.includes('pending')) lines.push(`   🔄 Thi eval mới → pass 1 (còn ${pendingPool} pending)`);
            s.bal = bal0; s.peak = bal0; s.pnl = 0;
            break;
          }
          if (s.bal >= bal0 + tgt) {
            s.payouts++;
            lines.push(`   💰 TK${i + 1} FUNDED đạt target → nhận PAYOUT $${psize.toLocaleString()}, giữ tk đánh tiếp`);
            s.bal = bal0; s.peak = bal0; s.pnl = 0;
            break;
          }
          if (s.pnl <= -ds) { lines.push(`   ⏹ TK${i + 1} hit DAILY STOP -$${ds} → nghỉ hôm nay`); break; }
          if (dt > 0 && s.pnl >= dt) { lines.push(`   ⏹ TK${i + 1} hit DAILY TARGET +$${dt} → nghỉ hôm nay`); break; }
        }
        dayBlocks.push(lines.join('\n'));
      });
      if (!dayActive) break;
      logRows.push({ day, blocks: dayBlocks });
    }

    const totBust = slots.reduce((a, s) => a + s.busts, 0);
    const totPayout = slots.reduce((a, s) => a + s.payouts, 0);
    const fundedEnd = slots.filter(s => s.phase === 'FUNDED').length;

    return { days: logRows.length, evalPassCount, totBust, totPayout, fundedEnd, conc, psize, logRows };
  }, []);

  return {
    isCalculating, progress, results, bestIndex,
    runOptimizer, calculateBiz, computeProfit, getStratified, renderWorkflow,
    setBestIndex
  };
}
