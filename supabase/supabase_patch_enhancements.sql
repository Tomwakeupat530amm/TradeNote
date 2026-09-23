-- MIGRATION SCRIPT: TRADENOTE PRO ENHANCEMENTS
-- Chạy script này trong Supabase Dashboard -> SQL Editor để bổ sung các cột mới cho bảng trades.

DO $$
BEGIN
    -- 1. Bổ sung trường Risk Amount (Số tiền rủi ro)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'risk_amount'
    ) THEN
        ALTER TABLE public.trades ADD COLUMN risk_amount NUMERIC;
    END IF;

    -- 2. Bổ sung trường R-Multiple (Hệ số R = PnL / Risk)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'r_multiple'
    ) THEN
        ALTER TABLE public.trades ADD COLUMN r_multiple NUMERIC;
    END IF;

    -- 3. Bổ sung trường Session (Phiên giao dịch: Asian, London, New York, London-NY Overlap)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'session'
    ) THEN
        ALTER TABLE public.trades ADD COLUMN session TEXT;
    END IF;

    -- 4. Bổ sung trường Checklist Results (Kết quả kỷ luật từ Playbook)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'checklist_results'
    ) THEN
        ALTER TABLE public.trades ADD COLUMN checklist_results JSONB DEFAULT '{}'::jsonb;
    END IF;

END $$;

-- Tự động cập nhật R-Multiple cho các lệnh cũ (nếu có PnL)
UPDATE public.trades 
SET 
    risk_amount = COALESCE(risk_amount, 500),
    r_multiple = CASE 
        WHEN COALESCE(risk_amount, 500) > 0 THEN ROUND((pnl / COALESCE(risk_amount, 500))::numeric, 2)
        ELSE 0 
    END
WHERE r_multiple IS NULL;
