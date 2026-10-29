-- Down 053 - hard_stop_config_lock
-- Gỡ ĐẦU TIÊN (thứ tự gỡ: 053 -> 052 -> 051 -> 050). Không chứa lệnh giao dịch.

DROP TRIGGER IF EXISTS trg_hard_stop_config_accounts ON public.accounts;
DROP TRIGGER IF EXISTS trg_hard_stop_config_prefs ON public.user_preferences;
DROP FUNCTION IF EXISTS public.hard_stop_config_accounts_trg();
DROP FUNCTION IF EXISTS public.hard_stop_config_prefs_trg();
DROP FUNCTION IF EXISTS public.hard_stop_prefs_config_decide(text, text, boolean);
DROP FUNCTION IF EXISTS public.hard_stop_config_decide(jsonb, jsonb, boolean);

DELETE FROM public.schema_migrations WHERE version = '053';
