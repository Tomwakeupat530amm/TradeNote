import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Sliding window rate limiter: max 5 requests per 10 minutes (600,000ms) per user
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const userRequestTimestamps = new Map<string, number[]>();

export function checkRateLimit(userId: string, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  // Prune map if too large to prevent memory leak
  if (userRequestTimestamps.size > 10000) {
    for (const [key, timestamps] of userRequestTimestamps.entries()) {
      if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] > RATE_LIMIT_WINDOW_MS) {
        userRequestTimestamps.delete(key);
      }
    }
  }

  const timestamps = userRequestTimestamps.get(userId) || [];
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldest = validTimestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000);
    userRequestTimestamps.set(userId, validTimestamps);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  validTimestamps.push(now);
  userRequestTimestamps.set(userId, validTimestamps);
  return { allowed: true, retryAfterSeconds: 0 };
}

interface AICoachResponse {
  big_leak: string;
  real_edge: string;
  what_if: string;
  action_rule: string;
}

export async function POST(req: NextRequest) {
  try {
    let payload: { locale?: string; totalTrades?: number; trades?: unknown[] } | null = null;
    try {
      payload = await req.json();
    } catch {
      payload = null;
    }
    const isEnglish = payload?.locale === "en";

    // 1. Authenticate with Supabase JWT
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    let userId: string | null = null;
    if (supabaseUrl && supabaseAnonKey && token) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && user) {
        userId = user.id;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { 
          error: isEnglish 
            ? "Please sign in to use the AI Coach feature." 
            : "Vui lòng đăng nhập để sử dụng tính năng AI Coach." 
        },
        { status: 401 }
      );
    }

    // 2. Rate limiting check (5 calls / 10 mins)
    const rateLimit = checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: isEnglish
            ? `You have reached the limit of 5 AI diagnostics per 10 minutes. Please try again after ${rateLimit.retryAfterSeconds} seconds.`
            : `Bạn đã đạt giới hạn 5 lần khám bệnh AI trong 10 phút. Vui lòng thử lại sau ${rateLimit.retryAfterSeconds} giây.` 
        },
        { 
          status: 429,
          headers: {
            "Retry-After": rateLimit.retryAfterSeconds.toString()
          }
        }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: isEnglish
            ? "OPENROUTER_API_KEY is not configured. Please open trade-note-app/.env.local and add: OPENROUTER_API_KEY=sk-or-v1-..."
            : "Chưa cấu hình OPENROUTER_API_KEY. Vui lòng mở file trade-note-app/.env.local và thêm: OPENROUTER_API_KEY=sk-or-v1-..."
        },
        { status: 400 }
      );
    }

    const hasTrades = (typeof payload?.totalTrades === 'number' && payload.totalTrades > 0) || 
                      (Array.isArray(payload?.trades) && payload.trades.length > 0);

    if (!payload || !hasTrades) {
      return NextResponse.json(
        {
          error: isEnglish 
            ? "Invalid trade data. At least a few trades are required for AI behavioral diagnostics."
            : "Dữ liệu không hợp lệ. Cần ít nhất một vài lệnh giao dịch để AI khám bệnh."
        },
        { status: 400 }
      );
    }

    const primaryModel = process.env.OPENROUTER_MODEL || "inclusionai/ling-3.0-flash-fin:free";
    const candidateModels = [
      primaryModel,
      "nex-agi/nex-n2.5-pro:free",
      "liquid/lfm-2.5-2.6b:free",
      "nvidia/nemotron-3.5-lightning:free",
    ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

    const systemPrompt = isEnglish
      ? `You are a Senior Prop Firm Risk Manager and Behavioral Trading Psychology Specialist.
Your task is to analyze statistical trading data of a Day Trader (specializing in MNQ/NQ Futures and Gold XAUUSD) and deliver an elite "Psychological & Capital Leak Diagnostic".

MANDATORY GUIDELINES:
1. NEVER GIVE GENERIC PLATITUDES (like "stay calm", "don't be greedy").
2. EVERY INSIGHT MUST BE BACKED BY CONCRETE DATA FROM THE PAYLOAD (cite exact dollar loss, winrate %, trading session, mistake tag).
3. RETURN ONLY A SINGLE JSON OBJECT (no markdown wrap, no external explanation) with exactly 4 fields:
   - "big_leak": The biggest capital leak draining the account (with dollar figures and root cause).
   - "real_edge": The trader's true statistical edge (which setup/session/asset is most profitable).
   - "what_if": Realistic what-if scenario if the trader eliminates the biggest mistake (e.g. recalculated PnL).
   - "action_rule": Exactly 1 actionable, enforceable discipline rule for next week.`
      : `Bạn là Trưởng phòng Quản lý Rủi ro Quỹ (Senior Prop Firm Risk Manager) kiêm Chuyên gia Tâm lý Giao dịch Thực chiến.
Nhiệm vụ của bạn là đọc dữ liệu thống kê giao dịch của một Day Trader (chuyên đánh MNQ Futures và Vàng XAUUSD) và đưa ra bản "Khám bệnh tâm lý & Lỗ hổng PnL".

NGUYÊN TẮC BẮT BUỘC:
1. TUYỆT ĐỐI KHÔNG NÓI ĐẠO LÝ CHUNG CHUNG (kiểu: "hãy giữ bình tĩnh", "đừng tham lam").
2. MỌI NHẬN XÉT PHẢI DỰA TRÊN SỐ LIỆU THỰC TẾ TRONG DỮ LIỆU ĐƯỢC GỬI (nêu cụ thể số tiền mất, tỷ lệ thắng, phiên giao dịch, lỗi sai).
3. TRẢ VỀ DUY NHẤT MỘT ĐỐI TƯỢNG JSON (không kèm markdown, không giải thích bên ngoài) với 4 trường:
   - "big_leak": Lỗ hổng lớn nhất đang làm hao hụt tài khoản (kèm số tiền và nguyên nhân cụ thể).
   - "real_edge": Thế mạnh kiếm tiền hiệu quả nhất (setup/phiên/tài sản nào đang gánh tài khoản).
   - "what_if": Mô phỏng kịch bản thực tế nếu trader loại bỏ lỗi sai lớn nhất (ví dụ: PnL sẽ thay đổi thế nào).
   - "action_rule": 1 quy tắc kỷ luật duy nhất, ngắn gọn và có thể thực thi ngay vào tuần tới.`;

    const userMessage = isEnglish
      ? `Here is my verified trading performance data:\n${JSON.stringify(payload, null, 2)}\n\nPlease diagnose and return the required 4-field JSON object in English.`
      : `Dưới đây là dữ liệu thống kê giao dịch thực tế của tôi:\n${JSON.stringify(payload, null, 2)}\n\nHãy phân tích và trả về đúng định dạng JSON 4 trường.`;

    // Helper to call OpenRouter with a 15-second per-model abort timeout
    const callOpenRouter = async (model: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        return await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://tradenote.local",
            "X-Title": "TradeNote Prop Journal"
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage }
            ],
            temperature: 0.3
          }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }
    };

    let response: Response | null = null;
    let selectedModel = primaryModel;
    let lastStatus = 500;
    let lastErrorText = "";

    // Waterfall cascade across candidate models
    for (const model of candidateModels) {
      try {
        const res = await callOpenRouter(model);
        if (res.ok) {
          response = res;
          selectedModel = model;
          break;
        } else {
          lastStatus = res.status;
          lastErrorText = await res.text();
          console.warn(`Candidate model ${model} failed with ${res.status}. Cascading to next fallback...`);
        }
      } catch (err: unknown) {
        console.warn(`Candidate model ${model} threw error:`, err);
      }
    }

    if (!response || !response.ok) {
      console.error(`All candidate OpenRouter models failed. Last error (${lastStatus}):`, lastErrorText);
      const friendlyMessage = isEnglish
        ? (lastStatus === 429
            ? "AI service is currently busy across provider pools. Please wait a moment and try again."
            : lastStatus === 401 || lastStatus === 403
            ? "AI service configuration error. Please contact administrator."
            : "Unable to reach AI diagnostics service. Please try again shortly.")
        : (lastStatus === 429
            ? "Dịch vụ AI đang tạm thời bận lượt gọi trên tất cả các cụm máy chủ. Vui lòng thử lại sau ít phút."
            : lastStatus === 401 || lastStatus === 403
            ? "Lỗi cấu hình dịch vụ AI. Vui lòng kiểm tra API Key."
            : "Không thể kết nối đến máy chủ khám bệnh AI. Vui lòng thử lại sau ít phút.");
      return NextResponse.json(
        { error: friendlyMessage },
        { status: lastStatus }
      );
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      return NextResponse.json(
        { 
          error: isEnglish 
            ? "AI did not return valid content." 
            : "AI không trả về nội dung hợp lệ." 
        },
        { status: 500 }
      );
    }

function flattenString(val: unknown, fallback = ""): string {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") return val.trim();
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) {
    return val.map((item) => flattenString(item)).filter(Boolean).join(". ");
  }
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const preferredKeys = ["description", "text", "content", "summary", "message", "leak", "edge", "rule", "impact", "detail"];
    for (const key of preferredKeys) {
      if (typeof obj[key] === "string" && obj[key]) return (obj[key] as string).trim();
    }
    const values = Object.entries(obj)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(" | ");
    return values || JSON.stringify(val);
  }
  return String(val);
}

    // Clean JSON content (remove markdown code blocks if present)
    const cleanedContent = rawContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    try {
      const parsed = JSON.parse(cleanedContent) as Record<string, unknown>;
      const safeAnalysis: AICoachResponse = {
        big_leak: flattenString(parsed.big_leak || parsed.bigLeak, rawContent),
        real_edge: flattenString(parsed.real_edge || parsed.realEdge, isEnglish ? "Maintain statistical discipline and focus on high-probability setups." : "Duy trì kỷ luật thống kê và tập trung vào các setup có xác suất cao."),
        what_if: flattenString(parsed.what_if || parsed.whatIf, isEnglish ? "Eliminating recurring leaks will substantially enhance net account expectancy." : "Loại bỏ các lệnh lỗi lặp lại sẽ cải thiện đáng kể kỳ vọng lợi nhuận ròng."),
        action_rule: flattenString(parsed.action_rule || parsed.actionRule, isEnglish ? "Strictly adhere to your pre-defined risk management rules." : "Tuân thủ nghiêm ngặt quy tắc quản lý rủi ro đã đề ra.")
      };

      return NextResponse.json({
        success: true,
        model: data.model || selectedModel,
        analysis: safeAnalysis
      });
    } catch {
      // If parsing fails, wrap the raw content into the structure
      return NextResponse.json({
        success: true,
        model: data.model || selectedModel,
        analysis: {
          big_leak: flattenString(rawContent),
          real_edge: isEnglish ? "Need more trades to extract statistical edge." : "Cần tích lũy thêm dữ liệu để bóc tách thế mạnh.",
          what_if: isEnglish ? "Maintain discipline to optimize PnL." : "Duy trì kỷ luật để tối ưu hóa PnL.",
          action_rule: isEnglish ? "Strictly adhere to risk management rules." : "Tuân thủ nghiêm ngặt quy tắc quản lý rủi ro."
        }
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("AI Coach route error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
