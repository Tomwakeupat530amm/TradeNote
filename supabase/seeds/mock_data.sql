DO $$
DECLARE
    target_user_id UUID;
    target_account_id UUID;
    i INT;
    random_days INT;
    random_asset TEXT;
    random_lot NUMERIC;
    random_pnl NUMERIC;
    trade_result TEXT;
    random_setup TEXT;
    random_emotion TEXT;
    random_mistake TEXT;
    random_confluences JSONB;

    assets TEXT[] := ARRAY['XAUUSD', 'EURUSD', 'BTCUSD', 'NAS100', 'GBPUSD'];
    setups TEXT[] := ARRAY['Breakout', 'Pullback', 'Reversal', 'Continuation', 'Other'];
    emotions TEXT[] := ARRAY['Calm', 'FOMO', 'Revenge', 'Greedy', 'Fearful'];
    mistakes TEXT[] := ARRAY['None', 'Moved SL', 'Early Entry', 'Late Entry', 'Overleveraged', 'Forced Trade'];
    confluences_list TEXT[] := ARRAY['Trendline', 'Support/Resistance', 'Fibonacci', 'Moving Average', 'RSI Divergence', 'Order Block'];
BEGIN
    -- 1. Tìm user_id dựa vào email
    SELECT id INTO target_user_id
    FROM auth.users
    WHERE email = 'minhnguyentuan31103@gmail.com'
    LIMIT 1;

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy user với email minhnguyentuan31103@gmail.com. Hãy đảm bảo bạn đã đăng nhập và tạo tài khoản với email này.';
    END IF;

    -- 2. Tìm hoặc tạo một account cho user này
    SELECT id INTO target_account_id
    FROM public.accounts
    WHERE user_id = target_user_id
    LIMIT 1;

    IF target_account_id IS NULL THEN
        INSERT INTO public.accounts (user_id, name, type, initial_balance, rules)
        VALUES (target_user_id, 'Mock Account', 'FTMO - Challenge', 100000, '{"drawdown": 10000, "profitTarget": 10000}'::jsonb)
        RETURNING id INTO target_account_id;
    END IF;

    -- 3. Xóa các trade cũ (tùy chọn - nếu bạn muốn reset data trước khi add mock, bỏ comment dòng dưới)
    -- DELETE FROM public.trades WHERE user_id = target_user_id;

    -- 4. Tạo 100 lệnh ngẫu nhiên trong vòng 30 ngày qua
    FOR i IN 1..100 LOOP
        random_days := floor(random() * 30); -- Từ 0 đến 29 ngày trước
        random_asset := assets[floor(random() * array_length(assets, 1)) + 1];
        random_lot := round((random() * 5 + 0.1)::numeric, 2); -- 0.1 đến 5.1

        -- Random PnL từ -500 đến 1500 để có win rate nghiêng về dương 1 chút
        random_pnl := round((random() * 2000 - 500)::numeric, 2);

        IF random_pnl > 0 THEN
            trade_result := 'Win';
        ELSIF random_pnl < 0 THEN
            trade_result := 'Loss';
        ELSE
            trade_result := 'Break Even';
        END IF;

        random_setup := setups[floor(random() * array_length(setups, 1)) + 1];
        random_emotion := emotions[floor(random() * array_length(emotions, 1)) + 1];
        random_mistake := mistakes[floor(random() * array_length(mistakes, 1)) + 1];

        -- Pick 1-2 random confluences
        random_confluences := jsonb_build_array(
            confluences_list[floor(random() * array_length(confluences_list, 1)) + 1]
        );

        INSERT INTO public.trades (
            user_id,
            account_id,
            asset,
            lot_size,
            pnl,
            result,
            setup,
            confluences,
            emotion,
            mistake,
            notes,
            date
        ) VALUES (
            target_user_id,
            target_account_id,
            random_asset,
            random_lot,
            random_pnl,
            trade_result,
            random_setup,
            random_confluences,
            random_emotion,
            random_mistake,
            'Mock trade generated for testing analytics',
            NOW() - (random_days || ' days')::INTERVAL - (floor(random() * 24) || ' hours')::INTERVAL
        );
    END LOOP;
END $$;
