'use client';

import { useTranslations } from 'next-intl';
import styles from '../simulator.module.css';
import { type SimResult } from '../useOptimizer';

interface ResultsTableProps {
  results: SimResult[];
  bestIndex: number;
  selectedRow: number;
  onRowClick: (r: SimResult, idx: number) => void;
  sweepLabel: string;
}

export function ResultsTable({ results, bestIndex, selectedRow, onRowClick, sweepLabel }: ResultsTableProps) {
  const t = useTranslations('Simulator');

  return (
    <div className={styles['table-container']}>
      <div className={styles['chart-header']}>
        <span className={styles['chart-title']}>{t('results.title')}</span>
        <span className={styles['chart-subtitle']}>{t('results.subtitle')}</span>
      </div>
      <div className={styles['table-scroll']}>
        <table id="optTable">
          <thead>
            <tr>
              <th>{sweepLabel}</th>
              <th>{t('results.colEvalPass')}</th>
              <th>{t('results.colPayoutPass')}</th>
              <th>{t('results.colBustRate')}</th>
              <th>{t('results.colEvalTrades')}</th>
              <th>{t('results.colPayoutTrades')}</th>
              <th>{t('results.colEv')}</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, idx) => (
              <tr
                key={idx}
                className={`${idx === bestIndex ? styles['best-row'] : ''} ${idx === selectedRow ? styles['selected-row'] : ''}`}
                onClick={() => onRowClick(r, idx)}
                style={{ cursor: 'pointer' }}
              >
                <td><b>{r.val}</b></td>
                <td style={{ color: r.eval_rate > 50 ? 'var(--success)' : r.eval_rate > 30 ? 'var(--accent-gold)' : '' }}>{r.eval_rate.toFixed(1)}%</td>
                <td style={{ color: r.payout_rate > 40 ? 'var(--success)' : r.payout_rate > 20 ? 'var(--accent-gold)' : '' }}>{r.payout_rate.toFixed(1)}%</td>
                <td style={{ color: r.bust_rate > 40 ? 'var(--danger)' : '' }}>{r.bust_rate.toFixed(1)}%</td>
                <td>{r.eval_avg || '--'} | {r.eval_min || '--'}</td>
                <td>{r.payout_avg || '--'} | {r.payout_min || '--'}</td>
                <td style={{ color: r.ev > 0 ? 'var(--success)' : 'var(--danger)' }}>{r.ev > 0 ? '+' : ''}{r.ev.toFixed(2)}$</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
