'use client';

import { useTranslations } from 'next-intl';
import styles from '../simulator.module.css';
import { type SimResult } from '../useOptimizer';

interface KPIGridProps {
  kpiResult: SimResult | null;
}

export function KPIGrid({ kpiResult }: KPIGridProps) {
  const t = useTranslations('Simulator');

  const evalClass = kpiResult ? (kpiResult.eval_rate > 50 ? 'val-good' : kpiResult.eval_rate > 30 ? 'val-gold' : 'val-bad') : 'val-gold';
  const payoutClass = kpiResult ? (kpiResult.payout_rate > 40 ? 'val-good' : kpiResult.payout_rate > 20 ? 'val-gold' : 'val-bad') : 'val-good';
  const bustClass = kpiResult ? (kpiResult.bust_rate > 40 ? 'val-bad' : 'val-secondary') : '';

  return (
    <div className={styles['kpi-grid']}>
      <div className={styles['kpi-card']}>
        <span className={styles['label']}>{t('kpi.evalPass')}</span>
        <span className={`${styles['value']} ${styles[evalClass]}`}>
          {kpiResult ? kpiResult.eval_rate.toFixed(1) + '%' : '--%'}
        </span>
      </div>
      <div className={styles['kpi-card']}>
        <span className={styles['label']}>{t('kpi.payoutPass')}</span>
        <span className={`${styles['value']} ${styles[payoutClass]}`}>
          {kpiResult ? kpiResult.payout_rate.toFixed(1) + '%' : '--%'}
        </span>
      </div>
      <div className={styles['kpi-card']}>
        <span className={styles['label']}>{t('kpi.bustRate')}</span>
        <span className={`${styles['value']} ${kpiResult ? styles[bustClass] : ''}`}>
          {kpiResult ? kpiResult.bust_rate.toFixed(1) + '%' : '--%'}
        </span>
      </div>
      <div className={styles['kpi-card']}>
        <span className={styles['label']}>{t('kpi.evalTrades')}</span>
        <span className={styles['value']}>
          {kpiResult ? `${kpiResult.eval_avg || '--'} | ${kpiResult.eval_min || '--'}` : '--'}
        </span>
      </div>
      <div className={styles['kpi-card']}>
        <span className={styles['label']}>{t('kpi.payoutTrades')}</span>
        <span className={styles['value']}>
          {kpiResult ? `${kpiResult.payout_avg || '--'} | ${kpiResult.payout_min || '--'}` : '--'}
        </span>
      </div>
    </div>
  );
}
