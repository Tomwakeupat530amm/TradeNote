'use client';

import { useTranslations } from 'next-intl';
import styles from '../simulator.module.css';
import { type AnalysisRow } from '../useOptimizer';

function riskType(r: number, t: (k: string) => string) {
  if (r <= 200) return t('analysis.typeSafe');
  if (r <= 300) return t('analysis.typeBalance');
  if (r <= 500) return t('analysis.typeRisky');
  if (r <= 600) return t('analysis.typeHighRisk');
  return t('analysis.typeViolent');
}

interface AnalysisTableProps {
  analysisRows: AnalysisRow[];
  onWorkflowClick: (risk: number) => void;
}

export function AnalysisTable({ analysisRows, onWorkflowClick }: AnalysisTableProps) {
  const t = useTranslations('Simulator');

  return (
    <div className={styles['biz-container']}>
      <div className={styles['chart-header']}>
        <span className={styles['chart-title']}>{t('analysis.title')}</span>
        <span className={styles['chart-subtitle']}>{t('analysis.subtitle')}</span>
      </div>
      <div className={styles['table-scroll']} style={{ maxHeight: 280 }}>
        <table id="optAnalysisTable">
          <thead>
            <tr><th>{t('analysis.colRisk')}</th><th>{t('analysis.colType')}</th><th>{t('analysis.colSetupEvals')}</th><th>{t('analysis.colSetupCost')}</th><th>{t('analysis.colFundSurv')}</th><th>{t('analysis.colProfit')}</th><th>{t('analysis.colAnnual')}</th><th>{t('analysis.colSelect')}</th></tr>
          </thead>
          <tbody>
            {analysisRows.map((row, idx) => {
              const r = row.r, er = r.eval_rate / 100;
              const fs = er > 0 ? Math.min(1, (r.payout_rate / 100) / er) * 100 : 0;
              const best = idx === 0;
              return (
                <tr
                  key={idx}
                  className={best ? styles['best-row'] : ''}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onWorkflowClick(r.val)}
                >
                  <td><b>${r.val}</b></td>
                  <td style={{ fontSize: 11 }}>{riskType(r.val, t)}</td>
                  <td>{row.setupEvals}</td>
                  <td>${row.setupCost.toLocaleString()}</td>
                  <td style={{ color: fs > 70 ? 'var(--success)' : fs > 50 ? 'var(--accent-gold)' : 'var(--danger)' }}>{fs.toFixed(1)}%</td>
                  <td style={{ color: 'var(--success)', fontWeight: 'bold' }}>${Math.round(row.pr2).toLocaleString()}</td>
                  <td>${Math.round(row.pr2 * 12).toLocaleString()}</td>
                  <td style={{ color: 'var(--accent-gold)', fontSize: 11 }}>{best ? t('analysis.best') : t('analysis.pick')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
