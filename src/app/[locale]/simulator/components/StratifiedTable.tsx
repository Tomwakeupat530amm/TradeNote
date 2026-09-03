'use client';

import { useTranslations } from 'next-intl';
import styles from '../simulator.module.css';
import { type SimResult, type StratRow } from '../useOptimizer';

interface StratifiedTableProps {
  stratVisible: boolean;
  isStratLoading: boolean;
  stratRows: StratRow[];
  kpiResult: SimResult | null;
  onStratDblClick: (s: StratRow, parentR: SimResult) => void;
}

export function StratifiedTable({
  stratVisible,
  isStratLoading,
  stratRows,
  kpiResult,
  onStratDblClick
}: StratifiedTableProps) {
  const t = useTranslations('Simulator');

  if (!stratVisible) return null;

  return (
    <div className={styles['table-container']} id="stratContainer">
      <div className={styles['chart-header']}>
        <span className={styles['chart-title']}>{t('stratified.title')}</span>
        <span className={styles['chart-subtitle']}>{t('stratified.subtitle')}</span>
      </div>
      <div className={styles['table-scroll']}>
        <table id="stratTable">
          <thead>
            <tr><th>{t('stratified.colCombo')}</th><th>{t('stratified.colSurvival')}</th><th>{t('stratified.colRate')}</th><th>{t('stratified.colTrades')}</th><th>{t('stratified.colNote')}</th></tr>
          </thead>
          <tbody>
            {isStratLoading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20 }}>{t('stratified.computing')}</td></tr>
            ) : stratRows.map((s, idx) => {
              const parentR = kpiResult;
              if (!parentR) return null;
              const evalPass = parentR.eval_rate / 100;
              const combined = evalPass * (s.sv / 100);
              return (
                <tr
                  key={idx}
                  onDoubleClick={() => onStratDblClick(s, parentR)}
                  style={{ background: combined > 0.15 ? 'rgba(63,185,80,0.03)' : '', cursor: 'pointer' }}
                >
                  <td><b>${kpiResult?.val}</b> → <b>${s.p2}</b></td>
                  <td style={{ color: s.sv > 70 ? 'var(--success)' : s.sv > 50 ? 'var(--accent-gold)' : 'var(--danger)' }}>{s.sv.toFixed(1)}%</td>
                  <td>{(combined * 100).toFixed(1)}%</td>
                  <td>{s.at}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{s.sv > 80 ? t('stratified.verySafe') : s.sv > 65 ? t('stratified.balanced') : t('stratified.fast')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
