'use client';

import { useTranslations } from 'next-intl';

interface GuideModalProps {
  guideOpen: boolean;
  setGuideOpen: (open: boolean) => void;
}

export function GuideModal({ guideOpen, setGuideOpen }: GuideModalProps) {
  const t = useTranslations('Simulator');

  if (!guideOpen) return null;

  return (
    <div
      id="guideModal"
      className="modal-overlay active"
      onClick={() => setGuideOpen(false)}
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
    >
      <div
        className="modal-container"
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, width: '90%', maxWidth: 1000, height: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.8)', overflow: 'hidden' }}
      >
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, color: 'var(--accent-gold)' }}>{t('guide.title')}</div>
          <button onClick={() => setGuideOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ flex: 1, padding: '30px 40px', overflowY: 'auto', color: 'var(--text-primary)', lineHeight: 1.6 }}>
          <p style={{ fontSize: 16, marginBottom: 24, color: 'var(--text-secondary)' }}>{t('guide.subtitle')}</p>
          
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent-gold)', marginBottom: 12 }}>{t('guide.section1.title')}</h3>
            <p>{t('guide.section1.p1')}</p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent-gold)', marginBottom: 12 }}>{t('guide.section2.title')}</h3>
            <ul style={{ paddingLeft: 20, listStyleType: 'disc', marginLeft: 20 }}>
              {t.raw('guide.section2.items').map((item: string, i: number) => <li key={i} style={{ marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: item.replace(/__b__/g, '<b>').replace(/__\/b__/g, '</b>') }} />)}
            </ul>
          </div>

          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent-gold)', marginBottom: 12 }}>{t('guide.section3.title')}</h3>
            <ul style={{ paddingLeft: 20, listStyleType: 'disc', marginLeft: 20 }}>
              {t.raw('guide.section3.items').map((item: string, i: number) => <li key={i} style={{ marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: item.replace(/__b__/g, '<b>').replace(/__\/b__/g, '</b>') }} />)}
            </ul>
          </div>

          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent-gold)', marginBottom: 12 }}>{t('guide.section4.title')}</h3>
            <p style={{ marginBottom: 12 }}>{t('guide.section4.p1')}</p>
            <ul style={{ paddingLeft: 20, marginBottom: 16, listStyleType: 'disc', marginLeft: 20 }}>
              {t.raw('guide.section4.items').map((item: string, i: number) => <li key={i} style={{ marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: item.replace(/__b__/g, '<b>').replace(/__\/b__/g, '</b>') }} />)}
            </ul>
            <div style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', padding: 12, borderRadius: 6, fontSize: 14 }} dangerouslySetInnerHTML={{ __html: t('guide.section4.tip').replace(/__b__/g, '<b>').replace(/__\/b__/g, '</b>') }} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent-gold)', marginBottom: 12 }}>{t('guide.section5.title')}</h3>
            <ul style={{ paddingLeft: 20, listStyleType: 'disc', marginLeft: 20 }}>
              {t.raw('guide.section5.items').map((item: string, i: number) => <li key={i} style={{ marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: item.replace(/__b__/g, '<b>').replace(/__\/b__/g, '</b>') }} />)}
            </ul>
          </div>

          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent-gold)', marginBottom: 12 }}>{t('guide.section6.title')}</h3>
            <ul style={{ paddingLeft: 20, marginBottom: 16, listStyleType: 'disc', marginLeft: 20 }}>
              {t.raw('guide.section6.items').map((item: string, i: number) => <li key={i} style={{ marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: item.replace(/__b__/g, '<b>').replace(/__\/b__/g, '</b>') }} />)}
            </ul>
            <div style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', padding: 12, borderRadius: 6, fontSize: 14 }} dangerouslySetInnerHTML={{ __html: t('guide.section6.warning').replace(/__b__/g, '<b>').replace(/__\/b__/g, '</b>') }} />
          </div>
        </div>
      </div>
    </div>
  );
}
