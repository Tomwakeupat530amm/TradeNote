'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Chart, registerables } from 'chart.js';
import styles from './simulator.module.css';
import {
  useOptimizer,
  PRESETS,
  type OptimizerParams,
  type BizParams,
  type SimResult,
  type StratRow,
  type AnalysisRow,
  type WorkflowSummary,
} from './useOptimizer';
import { GuideModal } from './components/GuideModal';
import { KPIGrid } from './components/KPIGrid';
import { ResultsTable } from './components/ResultsTable';
import { StratifiedTable } from './components/StratifiedTable';
import { AnalysisTable } from './components/AnalysisTable';
import { WorkflowViewer } from './components/WorkflowViewer';
import { useAccountStore } from '@/store/useAccountStore';
import { useTradeStore } from '@/store/useTradeStore';
import { TradesLoadBanner, useHistoryReady } from '@/components/TradesLoadBanner';
import { RefreshCw, Sparkles, ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { toast } from 'sonner';

Chart.register(...registerables);

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function SimulatorPage() {
  const t = useTranslations('Simulator');
  const { accounts, activeAccountId } = useAccountStore();
  const { trades } = useTradeStore();
  // P6 B4: simulator runs only on the full history of the active account.
  const historyReady = useHistoryReady();
  const activeAccount = accounts.find(a => a.id === activeAccountId) || accounts[0];
  const accountTrades = trades.filter(t => t.accountId === activeAccountId);

  // ── Fund Rules ──
  const [preset, setPreset] = useState('topstep50');
  const [balance, setBalance] = useState(50000);
  const [evalTarget, setEvalTarget] = useState(3000);
  const [payoutTarget, setPayoutTarget] = useState(3000);
  const [evalConsistency, setEvalConsistency] = useState(50);
  const [maxDrawdown, setMaxDrawdown] = useState(2000);
  const [ddType, setDdType] = useState('trailing');
  const [payoutRule, setPayoutRule] = useState('standard');

  // ── Strategy ──
  const [winrate, setWinrate] = useState(50);
  const [rr, setRr] = useState(1.5);
  const [maxTrades, setMaxTrades] = useState(500);
  const [dailyStop, setDailyStop] = useState(1000);
  const [dailyTarget, setDailyTarget] = useState(1500);
  const [hiddenRisk] = useState(500);

  // ── Sync from Active Account ──
  const handleSyncFromAccount = () => {
    if (!activeAccount) {
      toast.error(t('toast_no_account'));
      return;
    }
    if (accountTrades.length === 0) {
      toast.info(t('toast_no_trades', { name: activeAccount.name }));
      if (activeAccount.initialBalance) setBalance(activeAccount.initialBalance);
      if (activeAccount.rules?.trailingMaxDrawdown) setMaxDrawdown(activeAccount.rules.trailingMaxDrawdown);
      if (activeAccount.rules?.profitTarget) setEvalTarget(activeAccount.rules.profitTarget);
      if (activeAccount.rules?.maxDailyLoss) setDailyStop(activeAccount.rules.maxDailyLoss);
      return;
    }

    const wins = accountTrades.filter(t => t.result === 'Win');
    const losses = accountTrades.filter(t => t.result === 'Loss');
    const actualWinrate = Math.round((wins.length / accountTrades.length) * 100);

    const totalWinPnl = wins.reduce((s, t) => s + t.pnl, 0);
    const totalLossPnl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const avgWin = wins.length > 0 ? totalWinPnl / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLossPnl / losses.length : 0;
    
    let calculatedRR = 1.5;
    if (avgLoss > 0 && avgWin > 0) {
      calculatedRR = Number((avgWin / avgLoss).toFixed(2));
    }

    setWinrate(actualWinrate);
    setRr(calculatedRR);
    if (activeAccount.initialBalance) setBalance(activeAccount.initialBalance);
    if (activeAccount.rules?.trailingMaxDrawdown) setMaxDrawdown(activeAccount.rules.trailingMaxDrawdown);
    if (activeAccount.rules?.profitTarget) setEvalTarget(activeAccount.rules.profitTarget);
    if (activeAccount.rules?.maxDailyLoss) setDailyStop(activeAccount.rules.maxDailyLoss);

    toast.success(
      t('toast_sync_success', {
        name: activeAccount.name,
        winrate: actualWinrate,
        rr: calculatedRR,
        count: accountTrades.length,
      })
    );
  };


  // ── Sweep ──
  const [sweepVar, setSweepVar] = useState('risk');
  const [sweepMin, setSweepMin] = useState(100);
  const [sweepMax, setSweepMax] = useState(1000);
  const [sweepStep, setSweepStep] = useState(100);
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');

  // ── Business ──
  const [tpd, setTpd] = useState(20);
  const [concurrent, setConcurrent] = useState(5);
  const [pending, setPending] = useState(5);
  const [evalFee, setEvalFee] = useState(85);
  const [actFee] = useState(0);
  const [payoutSize, setPayoutSize] = useState(2000);
  const [minDays, setMinDays] = useState(5);

  // ── Results ──
  const [kpiResult, setKpiResult] = useState<SimResult | null>(null);
  const [selectedRow, setSelectedRow] = useState(-1);
  const [stratRows, setStratRows] = useState<StratRow[]>([]);
  const [stratVisible, setStratVisible] = useState(false);
  const [analysisRows, setAnalysisRows] = useState<AnalysisRow[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowSummary | null>(null);
  const [workflowRisk, setWorkflowRisk] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [isStratLoading, setIsStratLoading] = useState(false);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  const { isCalculating, progress, results, bestIndex, runOptimizer, calculateBiz, computeProfit, getStratified, renderWorkflow } = useOptimizer();

  // ── Biz params helper ──
  const getBizParams = useCallback((): BizParams => ({
    tpd, conc: concurrent, fee: evalFee, psize: payoutSize, minD: minDays, pending
  }), [tpd, concurrent, evalFee, payoutSize, minDays, pending]);

  // ── Load preset ──
  const loadPreset = useCallback((v: string) => {
    const p = PRESETS[v];
    if (!p) return;
    setBalance(p.b);
    setEvalTarget(p.te);
    setMaxDrawdown(p.dd);
    setDdType(p.dt);
    setEvalConsistency(p.ec);
    // Apply payout rule defaults
    const rule = p.payoutRule?.[payoutRule];
    if (rule) {
      setPayoutTarget(rule.tp);
      setPayoutSize(rule.ps);
      setMinDays(rule.md);
    }
  }, [payoutRule]);

  const updatePayoutRule = useCallback((rule: string) => {
    const p = PRESETS[preset];
    if (p?.payoutRule?.[rule]) {
      const r = p.payoutRule[rule];
      setPayoutTarget(r.tp);
      setPayoutSize(r.ps);
      setMinDays(r.md);
    }
  }, [preset]);

  const updateSweep = useCallback((v: string) => {
    if (v === 'wr') { setSweepMin(30); setSweepMax(80); setSweepStep(5); }
    else if (v === 'rr') { setSweepMin(0.3); setSweepMax(3.0); setSweepStep(0.2); }
    else { setSweepMin(100); setSweepMax(1000); setSweepStep(100); }
  }, []);

  // ── Chart ──
  const drawChart = useCallback((res: SimResult[], type: 'area' | 'bar' = 'area') => {
    if (!chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();
    const isArea = type === 'area';
    chartInstance.current = new Chart(chartRef.current, {
      type: isArea ? 'line' : 'bar',
      data: {
        labels: res.map(r => r.val),
        datasets: [
          { label: t('charts.legendEvalPass'), data: res.map(r => r.eval_rate), backgroundColor: isArea ? 'rgba(212,175,55,0.7)' : 'rgba(212,175,55,1)', borderColor: 'rgba(212,175,55,1)', borderWidth: 2, tension: isArea ? 0.3 : 0, fill: isArea },
          { label: t('charts.legendPayoutPass'), data: res.map(r => r.payout_rate), backgroundColor: isArea ? 'rgba(63,185,80,0.7)' : 'rgba(63,185,80,1)', borderColor: 'rgba(63,185,80,1)', borderWidth: 2, tension: isArea ? 0.3 : 0, fill: isArea },
          { label: t('charts.legendBustRate'), data: res.map(r => r.bust_rate), backgroundColor: isArea ? 'rgba(248,81,73,0.7)' : 'rgba(248,81,73,1)', borderColor: 'rgba(248,81,73,1)', borderWidth: 2, tension: isArea ? 0.3 : 0, fill: isArea },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { color: '#8B949E' } } },
        scales: {
          x: { grid: { color: 'rgba(48,54,61,0.5)' }, ticks: { color: '#8B949E' } },
          y: { grid: { color: 'rgba(48,54,61,0.5)' }, ticks: { color: '#8B949E' }, max: 100 }
        }
      }
    });
  }, [t]);

  // ── Cleanup Chart.js on unmount to prevent memory leak ──
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, []);

  // ── Biz display ──
  const bizResult = kpiResult
    ? calculateBiz(kpiResult.eval_rate / 100, kpiResult.payout_rate / 100, kpiResult.eval_avg, kpiResult.payout_avg, getBizParams())
    : null;

  // ── Run ──
  const handleRun = async () => {
    const params: OptimizerParams = {
      bal: balance, tgtE: evalTarget, tgtP: payoutTarget, dd: maxDrawdown,
      ec: evalConsistency / 100,
      wr: winrate / 100, rrv: rr, dRisk: hiddenRisk,
      maxT: maxTrades, ds: dailyStop, dt: dailyTarget,
      tpd, conc: concurrent, sv: sweepVar, smn: sweepMin, smx: sweepMax, sst: sweepStep
    };
    const { resArr, bi } = await runOptimizer(params);
    drawChart(resArr, chartType);

    if (bi !== -1 && resArr[bi]) {
      const best = resArr[bi];
      setKpiResult(best);
      setSelectedRow(bi);
      // Build analysis
      buildAnalysis(resArr);
      // Show stratified for best
      await handleStratified(best, params);
    } else {
      buildAnalysis(resArr);
    }
  };

  const buildAnalysis = (resArr: SimResult[]) => {
    const bp = getBizParams();
    const rows: AnalysisRow[] = resArr.map(r => {
      const er = r.eval_rate / 100;
      const setupEvals = Math.ceil((concurrent + pending) / er) || (concurrent + pending);
      const pr2 = computeProfit(r, bp);
      return { r, setupEvals, setupCost: setupEvals * evalFee, pr2 };
    }).sort((a, b) => b.pr2 - a.pr2);
    setAnalysisRows(rows);
    // auto-render workflow for best
    if (rows.length) {
      handleWorkflow(rows[0].r.val);
    }
  };

  const getParams = (): OptimizerParams => ({
    bal: balance, tgtE: evalTarget, tgtP: payoutTarget, dd: maxDrawdown,
    ec: evalConsistency / 100, wr: winrate / 100, rrv: rr, dRisk: hiddenRisk,
    maxT: maxTrades, ds: dailyStop, dt: dailyTarget,
    tpd, conc: concurrent, sv: sweepVar, smn: sweepMin, smx: sweepMax, sst: sweepStep
  });

  const handleStratified = async (r: SimResult, params?: OptimizerParams) => {
    setIsStratLoading(true);
    setStratVisible(true);
    const p = params ?? getParams();
    const rows = await getStratified(r, p);
    setStratRows(rows);
    setIsStratLoading(false);
  };

  const handleRowClick = async (r: SimResult, idx: number) => {
    setSelectedRow(idx);
    setKpiResult(r);
    await handleStratified(r);
  };

  const handleStratDblClick = (stratRow: StratRow, parentR: SimResult) => {
    const evalPassRate = parentR.eval_rate / 100;
    const combined = evalPassRate * (stratRow.sv / 100);
    const synth: SimResult = {
      ...parentR,
      payout_rate: combined * 100,
      bust_rate: 100 - combined * 100,
      payout_avg: stratRow.at,
      payout_min: stratRow.at,
    };
    setKpiResult(synth);
  };

  const handleWorkflow = (risk: number) => {
    const wf = renderWorkflow(risk, getParams(), getBizParams());
    setWorkflow(wf);
    setWorkflowRisk(risk);
  };

  // ── CSV Export ──
  const exportCSV = () => {
    if (!results.length) { alert(t('alerts.noResults')); return; }
    const pn = sweepVar === 'risk' ? 'Risk($)' : sweepVar === 'wr' ? 'Winrate(%)' : 'RR';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    let csv = `=== CONFIG ===\nTimestamp,${ts}\nBalance,$${balance}\nEval Target,$${evalTarget}\nWinrate,${winrate}%\nR:R,${rr}\n\n=== RESULTS ===\nParameter,Eval Pass%,Payout Pass%,Bust Rate%,Eval Avg,Eval Min,Payout Avg,Payout Min,EV\n`;
    results.forEach(r => {
      csv += `${r.val},${r.eval_rate.toFixed(1)},${r.payout_rate.toFixed(1)},${r.bust_rate.toFixed(1)},${r.eval_avg},${r.eval_min},${r.payout_avg},${r.payout_min},${r.ev.toFixed(2)}\n`;
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `optimizer_${pn}_${ts}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  // ── Sweep header label ──
  const sweepLabel = sweepVar === 'risk' ? t('sweep.labelRisk') : sweepVar === 'wr' ? t('sweep.labelWr') : t('sweep.labelRR');


  return (
    <>
      {/* Guide Modal */}
      <GuideModal guideOpen={guideOpen} setGuideOpen={setGuideOpen} />

      <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        {/* Header */}
        <header style={{ padding: '16px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link
              href="/analytics"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#cbd5e1',
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} />
              <span>{t('back_to_analytics')}</span>
            </Link>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{t('title')}</h1>
          </div>
          <button className={styles['btn-guide']} onClick={() => setGuideOpen(true)}>
            {t('btnGuide')}
          </button>
        </header>

        <div className={styles['layout']}>
          {/* ── Sidebar ── */}
          <div className={styles['sidebar']}>
            {/* Fund Rules */}
            <div className={styles['section-title']}>{t('sections.fundRules')}</div>

            <div className={styles['input-group']}>
              <label>{t('fund.preset')}</label>
              <select value={preset} onChange={e => { setPreset(e.target.value); loadPreset(e.target.value); }}>
                <optgroup label={t('fund.groupTopstep')}>
                  <option value="topstep50">Topstep 50k</option>
                  <option value="topstep100">Topstep 100k</option>
                  <option value="topstep150">Topstep 150k</option>
                </optgroup>
                <optgroup label={t('fund.groupBulenox')}>
                  <option value="blx50">Bulenox 50k</option>
                  <option value="blx100">Bulenox 100k</option>
                </optgroup>
                <option value="custom">{t('fund.custom')}</option>
              </select>
            </div>

            <div className={styles['input-group']}>
              <label><span>{t('fund.balance')}</span><span>$</span></label>
              <input type="number" value={balance} onChange={e => setBalance(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('fund.evalTarget')}</span><span>$</span></label>
              <input type="number" value={evalTarget} onChange={e => setEvalTarget(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('fund.payoutTarget')}</span><span>$</span></label>
              <input type="number" value={payoutTarget} onChange={e => setPayoutTarget(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('fund.evalConsistency')}</span><span>%</span></label>
              <input type="number" value={evalConsistency} onChange={e => setEvalConsistency(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('fund.maxDrawdown')}</span><span>$</span></label>
              <input type="number" value={maxDrawdown} onChange={e => setMaxDrawdown(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label>{t('fund.ddType')}</label>
              <select value={ddType} onChange={e => setDdType(e.target.value)}>
                <option value="trailing">{t('fund.ddTrailing')}</option>
                <option value="static">{t('fund.ddStatic')}</option>
              </select>
            </div>
            <div className={styles['input-group']}>
              <label>{t('fund.payoutRule')}</label>
              <select value={payoutRule} onChange={e => { setPayoutRule(e.target.value); updatePayoutRule(e.target.value); }}>
                <option value="standard">{t('fund.ruleStandard')}</option>
                <option value="consistency">{t('fund.ruleConsistency')}</option>
              </select>
            </div>

            {/* Strategy Engine */}
            <div className={styles['section-title']}>{t('sections.strategyEngine')}</div>

            {/* Quick Account Sync Card */}
            <div className="mb-3.5 p-3 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-blue-950/40 border border-indigo-500/20">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  {t('sync_card_title')}
                </span>
                <span className="text-[10px] text-gray-400 font-mono">
                  {activeAccount?.name || t('account_fallback')}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mb-2">
                {accountTrades.length > 0
                  ? t('sync_card_has_trades', { count: accountTrades.length })
                  : t('sync_card_no_trades')}
              </p>
              <button
                type="button"
                onClick={handleSyncFromAccount}
                disabled={!historyReady}
                className="w-full py-1.5 px-3 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-all border border-indigo-400/30"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('btn_sync')}
              </button>
            </div>

            <div className={styles['input-group']}>
              <label><span>{t('strategy.winrate')}</span><span>%</span></label>
              <input type="number" value={winrate} step={1} onChange={e => setWinrate(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('strategy.rewardRisk')}</span><span>X</span></label>
              <input type="number" value={rr} step={0.1} onChange={e => setRr(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('strategy.maxTrades')}</span></label>
              <input type="number" value={maxTrades} onChange={e => setMaxTrades(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('strategy.dailyStop')}</span><span>$</span></label>
              <input type="number" value={dailyStop} onChange={e => setDailyStop(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('strategy.dailyTarget')}</span><span>$</span></label>
              <input type="number" value={dailyTarget} onChange={e => setDailyTarget(+e.target.value)} />
            </div>

            {/* Sweep Variable */}
            <div className={styles['section-title']}>{t('sections.sweepVariable')}</div>
            <div className={styles['input-group']}>
              <label>{t('sweep.variable')}</label>
              <select value={sweepVar} onChange={e => { setSweepVar(e.target.value); updateSweep(e.target.value); }}>
                <option value="risk">{t('sweep.labelRisk')}</option>
                <option value="wr">{t('sweep.labelWr')}</option>
                <option value="rr">{t('sweep.labelRR')}</option>
              </select>
            </div>
            <div className={styles['range-row']}>
              <div><label>{t('sweep.min')}</label><input type="number" value={sweepMin} onChange={e => setSweepMin(+e.target.value)} /></div>
              <div><label>{t('sweep.max')}</label><input type="number" value={sweepMax} onChange={e => setSweepMax(+e.target.value)} /></div>
              <div><label>{t('sweep.step')}</label><input type="number" value={sweepStep} onChange={e => setSweepStep(+e.target.value)} /></div>
            </div>

            {/* Business */}
            <div className={styles['section-title']}>{t('sections.business')}</div>
            <div className={styles['input-group']}>
              <label><span>{t('business.tradingVelocity')}</span><span>{t('units.tradesPerDay')}</span></label>
              <input type="number" value={tpd} onChange={e => setTpd(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('business.targetFunded')}</span><span>{t('units.slots')}</span></label>
              <input type="number" value={concurrent} onChange={e => setConcurrent(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('business.passPending')}</span></label>
              <input type="number" value={pending} onChange={e => setPending(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('business.evalFee')}</span><span>$</span></label>
              <input type="number" value={evalFee} onChange={e => setEvalFee(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('business.activationFee')}</span><span>$</span></label>
              <input type="number" value={actFee} readOnly />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('business.payoutSize')}</span><span>$</span></label>
              <input type="number" value={payoutSize} onChange={e => setPayoutSize(+e.target.value)} />
            </div>
            <div className={styles['input-group']}>
              <label><span>{t('business.minTradingDays')}</span></label>
              <input type="number" value={minDays} onChange={e => setMinDays(+e.target.value)} />
            </div>

            <TradesLoadBanner compact />
            <button className={styles['btn-run']} data-testid="simulator-run" onClick={handleRun} disabled={isCalculating || !historyReady}>
              {isCalculating ? t('btnRunning', { p: progress }) : t('btnRun')}
            </button>
            {isCalculating && (
              <div style={{ textAlign: 'center', color: 'var(--accent-gold)', marginTop: 8, fontWeight: 'bold' }}>
                {t('btnRunning', { p: progress })}
              </div>
            )}
          </div>

          {/* ── Dashboard ── */}
          <div className={styles['dashboard']}>
            {/* KPI Grid */}
            <KPIGrid kpiResult={kpiResult} />

            {/* Chart */}
            <div className={styles['chart-container']}>
              <div className={styles['chart-header']}>
                <div>
                  <span className={styles['chart-title']}>{t('charts.optCurve')}</span>
                  <span className={styles['chart-subtitle']} style={{ marginLeft: 12 }}>{t('charts.optCurveSub')}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => {
                      setChartType(prev => {
                        const next = prev === 'area' ? 'bar' : 'area';
                        if (results && results.length > 0) {
                          drawChart(results, next);
                        }
                        return next;
                      });
                    }} 
                    style={{ fontSize: 10, padding: '5px 10px', background: 'var(--bg-base)', color: 'var(--accent-gold)', border: '1px solid var(--accent-gold)', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {t('charts.toggleChart')}
                  </button>
                  <button onClick={exportCSV} style={{ fontSize: 10, padding: '5px 10px', background: 'var(--bg-base)', color: 'var(--accent-gold)', border: '1px solid var(--accent-gold)', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {t('charts.exportCsv')}
                  </button>
                </div>
              </div>
              <div style={{ position: 'relative', height: '350px', width: '100%' }}>
                <canvas ref={chartRef} id="mcChart" />
              </div>
            </div>

            {/* Optimization Results Table */}
            <ResultsTable
              results={results}
              bestIndex={bestIndex}
              selectedRow={selectedRow}
              onRowClick={handleRowClick}
              sweepLabel={sweepLabel}
            />

            {/* Stratified Table */}
            <StratifiedTable
              stratVisible={stratVisible}
              isStratLoading={isStratLoading}
              stratRows={stratRows}
              kpiResult={kpiResult}
              onStratDblClick={handleStratDblClick}
            />

            {/* Business Calculator */}
            <div className={styles['biz-container']}>
              <div className={styles['chart-header']}>
                <span className={styles['chart-title']}>{t('biz.title')}</span>
                <span className={styles['chart-subtitle']}>{t('biz.subtitle')}</span>
              </div>
              <div className={styles['biz-funnel']}>
                <div className={styles['funnel-step']}><span className={styles['f-label']}>{t('biz.setupEvals')}</span><span className={styles['f-value']}>{bizResult?.setupEvals ?? '--'}</span></div>
                <div className={styles['funnel-arrow']}>→</div>
                <div className={styles['funnel-step']}><span className={styles['f-label']}>{t('biz.refillEvals')}</span><span className={styles['f-value']}>{bizResult?.en ?? '--'}</span></div>
                <div className={styles['funnel-arrow']}>→</div>
                <div className={styles['funnel-step']}><span className={styles['f-label']}>{t('biz.fundedSurvival')}</span><span className={`${styles['f-value']} ${styles['val-gold']}`}>{bizResult ? (bizResult.fs * 100).toFixed(1) + '%' : '--'}</span></div>
                <div className={styles['funnel-arrow']}>→</div>
                <div className={styles['funnel-step']}><span className={styles['f-label']}>{t('biz.payoutsMonth')}</span><span className={`${styles['f-value']} ${styles['val-good']}`}>{bizResult?.np?.toFixed(1) ?? '--'}</span></div>
              </div>
              <div className={styles['biz-grid']}>
                <div className={styles['biz-card']}><span className={styles['label']}>{t('biz.timePayout')}</span><span className={styles['value']}>{bizResult?.fd?.toFixed(1) ?? '--'}</span></div>
                <div className={styles['biz-card']}><span className={styles['label']}>{t('biz.timeRefill')}</span><span className={styles['value']}>{bizResult?.fd?.toFixed(1) ?? '--'}</span></div>
                <div className={styles['biz-card']}><span className={styles['label']}>{t('biz.expense')}</span><span className={`${styles['value']} ${styles['val-bad']}`}>{bizResult ? '-$' + fmt(bizResult.ex) : '--$'}</span></div>
                <div className={styles['biz-card']}><span className={styles['label']}>{t('biz.revenue')}</span><span className={`${styles['value']} ${styles['val-good']}`}>{bizResult ? '+$' + fmt(bizResult.rv) : '--$'}</span></div>
                <div className={`${styles['biz-card']} ${styles['highlight']}`}>
                  <span className={styles['label']}>{t('biz.netProfit')}</span>
                  <span className={`${styles['value']} ${bizResult ? (bizResult.pr2 >= 0 ? styles['val-good'] : styles['val-bad']) : ''}`}>
                    {bizResult ? (bizResult.pr2 >= 0 ? '+' : '-') + '$' + fmt(Math.abs(bizResult.pr2)) : '--$'}
                  </span>
                </div>
                <div className={styles['biz-card']}><span className={styles['label']}>{t('biz.roi')}</span><span className={styles['value']}>{bizResult ? bizResult.roi.toFixed(0) + '%' : '--%'}</span></div>
                <div className={styles['biz-card']}><span className={styles['label']}>{t('biz.breakeven')}</span><span className={styles['value']}>{bizResult ? bizResult.breakeven + ' ' + t('biz.breakEvenUnit') : '--'}</span></div>
                <div className={styles['biz-card']}><span className={styles['label']}>{t('biz.costFunded')}</span><span className={styles['value']}>{bizResult ? '$' + fmt(bizResult.costFunded) : '--$'}</span></div>
                <div className={styles['biz-card']}><span className={styles['label']}>{t('biz.revMult')}</span><span className={styles['value']}>{bizResult ? bizResult.multiplier.toFixed(2) + 'x' : '--x'}</span></div>
                <div className={styles['biz-card']}><span className={styles['label']}>{t('biz.annual')}</span><span className={`${styles['value']} ${styles['val-gold']}`}>{bizResult ? '$' + fmt(bizResult.annual) : '--$'}</span></div>
              </div>
            </div>

            {/* Analysis */}
            <AnalysisTable
              analysisRows={analysisRows}
              onWorkflowClick={handleWorkflow}
            />

            {/* Workflow */}
            <WorkflowViewer
              workflow={workflow}
              workflowRisk={workflowRisk}
              concurrent={concurrent}
              tpd={tpd}
              evalTarget={evalTarget}
              rr={rr}
              maxDrawdown={maxDrawdown}
              dailyTarget={dailyTarget}
              dailyStop={dailyStop}
              payoutSize={payoutSize}
            />
          </div>
        </div>
      </div>
    </>
  );
}
