'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

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
  const tLog = useTranslations('Simulator.workflow');
  const [isCalculating, setIsCalculating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SimResult[]>([]);
  const [bestIndex, setBestIndex] = useState(-1);
  const cachedResults = useRef<SimResult[]>([]);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('./optimizer.worker.ts', import.meta.url));
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const runOptimizer = useCallback((params: OptimizerParams) => {
    return new Promise<{ resArr: SimResult[], bi: number }>((resolve) => {
      setIsCalculating(true);
      setProgress(0);
      
      const msgId = Date.now().toString();
      
      const handleMessage = (e: MessageEvent) => {
        if (e.data.msgId !== msgId) return;
        
        if (e.data.type === 'PROGRESS') {
          setProgress(e.data.progress);
        } else if (e.data.type === 'DONE') {
          workerRef.current?.removeEventListener('message', handleMessage);
          const { results: resArr, bestIndex: bi } = e.data;
          
          setIsCalculating(false);
          setResults(resArr);
          cachedResults.current = resArr;
          setBestIndex(bi);
          
          resolve({ resArr, bi });
        }
      };
      
      workerRef.current?.addEventListener('message', handleMessage);
      workerRef.current?.postMessage({ type: 'RUN_OPTIMIZER', payload: params, msgId });
    });
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
    return new Promise(resolve => {
      const msgId = Date.now().toString() + "_strat";
      const handleMessage = (e: MessageEvent) => {
        if (e.data.msgId !== msgId) return;
        if (e.data.type === 'STRATIFIED_DONE') {
          workerRef.current?.removeEventListener('message', handleMessage);
          resolve(e.data.results);
        }
      };
      workerRef.current?.addEventListener('message', handleMessage);
      workerRef.current?.postMessage({ type: 'GET_STRATIFIED', payload: { r, params }, msgId });
    });
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
          const resultStr = isWin ? tLog('winText', { amount: win }) : tLog('lossText', { amount: risk });
          lines.push(tLog('tradeLog', { id: i + 1, phase: s.phase, tradeNum: t + 1, result: resultStr, balance: Math.round(s.bal).toLocaleString() }));
          if (s.bal <= s.peak - dd) {
            s.busts++;
            let src = '';
            let hasPending = false;
            if (pendingPool > 0) { pendingPool--; src = tLog('bustPending', { left: pendingPool }); hasPending = true; }
            else { src = tLog('bustNoPending'); }
            if (evalPassRate > 0) {
              for (let k = 0; k < 6; k++) {
                if (Math.random() < evalPassRate) { pendingPool++; evalPassCount++; break; }
              }
            }
            lines.push(tLog('bustLog', { id: i + 1, src }));
            if (hasPending) lines.push(tLog('evalPassLog', { left: pendingPool }));
            s.bal = bal0; s.peak = bal0; s.pnl = 0;
            break;
          }
          if (s.bal >= bal0 + tgt) {
            s.payouts++;
            lines.push(tLog('fundedTarget', { id: i + 1, amount: psize.toLocaleString() }));
            s.bal = bal0; s.peak = bal0; s.pnl = 0;
            break;
          }
          if (s.pnl <= -ds) { lines.push(tLog('dailyStop', { id: i + 1, amount: ds })); break; }
          if (dt > 0 && s.pnl >= dt) { lines.push(tLog('dailyTarget', { id: i + 1, amount: dt })); break; }
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
  }, [tLog]);

  return {
    isCalculating, progress, results, bestIndex,
    runOptimizer, calculateBiz, computeProfit, getStratified, renderWorkflow,
    setBestIndex
  };
}
