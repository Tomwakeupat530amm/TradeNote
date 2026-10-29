-- Down 052 - hard_stop_trigger
-- Gỡ SAU 053 (053 gọi hard_stop_evaluate / hard_stop_decide). Patch 052 không tạo chỉ mục nên không DROP chỉ mục.
-- Nhanh hơn khi sự cố: ALTER TABLE public.trades DISABLE TRIGGER trg_hard_stop; (không cần gỡ patch).
-- Không chứa lệnh giao dịch.

DROP TRIGGER IF EXISTS trg_hard_stop ON public.trades;
DROP FUNCTION IF EXISTS public.hard_stop_trades_trg();
DROP FUNCTION IF EXISTS public.hard_stop_evaluate(uuid, uuid, text, jsonb, jsonb, timestamptz);
DROP FUNCTION IF EXISTS public.hard_stop_decide(jsonb, jsonb, text, text, jsonb, jsonb, timestamptz);

DELETE FROM public.schema_migrations WHERE version = '052';
