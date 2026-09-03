'use client';

import { useTranslations } from 'next-intl';
import styles from '../simulator.module.css';
import { type WorkflowSummary } from '../useOptimizer';

interface WorkflowViewerProps {
  workflow: WorkflowSummary | null;
  workflowRisk: number;
  concurrent: number;
  tpd: number;
  evalTarget: number;
  rr: number;
  maxDrawdown: number;
  dailyTarget: number;
  dailyStop: number;
  payoutSize: number;
}

export function WorkflowViewer({
  workflow,
  workflowRisk,
  concurrent,
  tpd,
  evalTarget,
  rr,
  maxDrawdown,
  dailyTarget,
  dailyStop,
  payoutSize
}: WorkflowViewerProps) {
  const t = useTranslations('Simulator');

  if (!workflow) return null;

  return (
    <div className={styles['biz-container']} id="workflowContainer">
      <div className={styles['chart-header']}>
        <span className={styles['chart-title']}>{t('workflow.titlePrefix')} <span>${workflowRisk}</span></span>
        <span className={styles['chart-subtitle']}>
          {t('workflow.subtitleTpl', { conc: concurrent, tpa: Math.max(1, Math.ceil(tpd / concurrent)) })}
        </span>
      </div>
      <div className={styles['wf-summary']}>
        <div className={styles['wf-row']}>
          <div className={styles['funnel-step']}><span className={styles['f-label']}>{t('workflow.simDays')}</span><span className={styles['f-value']}>{workflow.days}</span></div>
          <div className={styles['funnel-arrow']}>→</div>
          <div className={styles['funnel-step']}><span className={styles['f-label']}>{t('workflow.evalPassRefill')}</span><span className={styles['f-value']}>{workflow.evalPassCount}</span></div>
          <div className={styles['funnel-arrow']}>→</div>
          <div className={styles['funnel-step']}><span className={styles['f-label']}>{t('workflow.tkBust')}</span><span className={`${styles['f-value']} ${styles['val-bad']}`}>{workflow.totBust}</span></div>
        </div>
        <div className={styles['wf-row']}>
          <div className={styles['funnel-step']}><span className={styles['f-label']}>{t('workflow.payoutReceived')}</span><span className={`${styles['f-value']} ${styles['val-good']}`}>${(workflow.totPayout * workflow.psize).toLocaleString()}</span></div>
          <div className={styles['funnel-arrow']}>→</div>
          <div className={styles['funnel-step']}><span className={styles['f-label']}>{t('workflow.fundedEnd')}</span><span className={`${styles['f-value']} ${styles['val-gold']}`}>{workflow.fundedEnd}/{workflow.conc}</span></div>
        </div>
      </div>
      {/* Process section */}
      <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, marginBottom: 14 }}>
        <div style={{ fontWeight: 600, color: 'var(--accent-gold)', marginBottom: 12 }}>{t('workflow.processTitle')} — ${workflowRisk}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {([
            { title: t('workflow.morning'), items: [
              t('workflow.morningItem1', { conc: concurrent, target: evalTarget.toLocaleString() }),
              t('workflow.morningItem2', { tpa: Math.max(1, Math.ceil(tpd / concurrent)), tpd, conc: concurrent }),
              t('workflow.morningItem3', { risk: String(workflowRisk), win: (workflowRisk * rr).toFixed(0) })
            ]},
            { title: t('workflow.evalGoal'), items: [
              t('workflow.evalItem1', { target: evalTarget.toLocaleString() }),
              t('workflow.evalItem2'),
              t('workflow.evalItem3', { dd: maxDrawdown.toLocaleString() })
            ]},
            { title: t('workflow.stopRules'), items: [
              t('workflow.stopItem1', { tpa: Math.max(1, Math.ceil(tpd / concurrent)) }),
              t('workflow.stopItem2', { dt: String(dailyTarget) }),
              t('workflow.stopItem3', { ds: String(dailyStop) })
            ]},
            { title: t('workflow.accountMgmt'), items: [
              t('workflow.mgmtItem1'),
              t('workflow.mgmtItem2'),
              t('workflow.mgmtItem3', { ps: payoutSize.toLocaleString() })
            ]},
          ] as { title: string; items: string[] }[]).map((box, i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
              <div style={{ fontWeight: 600, color: 'var(--accent-gold)', marginBottom: 8, fontSize: 12 }}>{box.title}</div>
              <ol style={{ paddingLeft: 16, margin: 0 }}>
                {box.items.map((item, j) => <li key={j} style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: item }} />)}
              </ol>
            </div>
          ))}
        </div>
      </div>
      {/* Workflow log table */}
      <div className={styles['table-scroll']} style={{ maxHeight: 360 }}>
        <table id="wfTable">
          <thead>
            <tr><th style={{ minWidth: 100 }}>{t('workflow.colDay')}</th><th>{t('workflow.colResult')}</th></tr>
          </thead>
          <tbody>
            {workflow.logRows.map(row => (
              <tr key={row.day}>
                <td style={{ verticalAlign: 'top' }}><b>{t('workflow.dayLabel', { d: row.day })}</b></td>
                <td>
                  <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--text-primary)' }}>
                    {row.blocks.join('\n')}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
