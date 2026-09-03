/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path');
/* eslint-disable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-require-imports */
const viPath = path.join(__dirname, '../messages/vi.json');
/* eslint-disable @typescript-eslint/no-require-imports */
const enPath = path.join(__dirname, '../messages/en.json');
/* eslint-disable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-require-imports */
const viData = JSON.parse(fs.readFileSync(viPath, 'utf8'));
/* eslint-disable @typescript-eslint/no-require-imports */
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
/* eslint-disable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-require-imports */
viData.Simulator.guide = {
/* eslint-disable @typescript-eslint/no-require-imports */
  "title": "📖 Hướng Dẫn Sử Dụng Chi Tiết - Elite Quant Optimizer",
/* eslint-disable @typescript-eslint/no-require-imports */
  "newWindow": "↗ Cửa sổ mới",
/* eslint-disable @typescript-eslint/no-require-imports */
  "subtitle": "Công cụ tính toán & tối ưu hóa xác suất thi quỹ, quản trị rủi ro & mô phỏng kinh doanh Prop Trading chuyên sâu.",
/* eslint-disable @typescript-eslint/no-require-imports */
  "section1": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "1. Tổng Quan Hệ Thống (System Overview)",
/* eslint-disable @typescript-eslint/no-require-imports */
    "p1": "Elite Quant Optimizer không chỉ là một bảng tính xác suất cơ bản. Đây là một trình giả lập Monte Carlo nâng cao, giúp bạn định lượng chính xác khả năng sống sót và lợi nhuận khi tham gia các quỹ Prop Firm (Topstep, Bulenox, APEX...). Bằng cách giả lập hàng ngàn kịch bản thị trường dựa trên thông số hệ thống của bạn, công cụ giúp bạn ngừng phỏng đoán và bắt đầu đưa ra các quyết định có tính toán dựa trên toán học (Expected Value)."
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section2": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "2. Thiết Lập Quy Tắc Quỹ (Fund Rules Setup)",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Preset (Cấu hình sẵn):</b> Tải nhanh bộ quy tắc của các quỹ phổ biến. Ví dụ: Topstep 50k sẽ tự động thiết lập số dư 50k, mục tiêu 3k và Drawdown 2k.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Balance & Targets ($):</b> Số vốn ban đầu, mục tiêu lợi nhuận để qua vòng đánh giá (Eval Target) và mục tiêu an toàn để nhận Payout đầu tiên.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Eval Consistency (%):</b> Quy tắc nhất quán lợi nhuận. Nếu quỹ yêu cầu một ngày không được chiếm quá 50% tổng lợi nhuận, bộ mô phỏng sẽ tự động tính toán số ngày giao dịch thêm cần thiết để pha loãng phần trăm này nếu bạn thắng quá lớn trong một ngày.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Max Drawdown & DD Type:</b> Tính toán sức chịu đựng của tài khoản. Trailing Drawdown sẽ trượt theo mức lợi nhuận cao nhất của bạn (rất khắt khe), trong khi Static Drawdown sẽ cố định từ số dư ban đầu.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Payout Rule:</b> Cách bạn đạt đủ điều kiện rút tiền. 'Standard' (ví dụ 5 ngày thắng trên $150) hoặc 'Consistency' (không ngày nào vượt 40% số tiền rút)."
/* eslint-disable @typescript-eslint/no-require-imports */
    ]
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section3": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "3. Động Cơ Chiến Lược (Strategy Engine)",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Winrate (%):</b> Tỷ lệ thắng thực tế của hệ thống giao dịch của bạn. Hãy nhập con số thực tế dựa trên dữ liệu quá khứ.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Reward/Risk (X):</b> Tỷ lệ Thưởng/Rủi ro. Ví dụ: R:R = 1.5 nghĩa là bạn ăn $150 cho mỗi $100 chịu rủi ro.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Daily Stop ($) & Daily Target ($):</b> Công tắc an toàn cực kỳ quan trọng. Trình giả lập sẽ tự động ngừng giao dịch trong ngày nếu chạm một trong hai ngưỡng này, mô phỏng kỷ luật chốt lời/cắt lỗ bảo vệ tài khoản khỏi 'tilt'."
/* eslint-disable @typescript-eslint/no-require-imports */
    ]
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section4": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "4. Quét Biến Số (Sweep Variable) & Phân Tích",
/* eslint-disable @typescript-eslint/no-require-imports */
    "p1": "Thay vì thử nghiệm mù quáng, tính năng này chạy hàng loạt mô phỏng qua nhiều mức giá trị khác nhau (Risk, Winrate, R:R) để vẽ ra đường cong tối ưu hóa:",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Min / Max / Step:</b> Giới hạn vùng không gian mà bạn muốn quét. Ví dụ: Quét rủi ro mỗi lệnh từ $100 đến $500 với bước nhảy $50.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Eval Pass%:</b> Xác suất vượt qua vòng thử thách.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Payout Pass%:</b> Xác suất sống sót qua cả vòng thử thách VÀ chạm tới lần rút tiền đầu tiên.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Expected Value (EV):</b> Kỳ vọng lợi nhuận toán học trên mỗi giao dịch."
/* eslint-disable @typescript-eslint/no-require-imports */
    ],
/* eslint-disable @typescript-eslint/no-require-imports */
    "tip": "💡 <b>Mẹo tương tác:</b> Bấm vào bất kỳ một hàng nào trong bảng kết quả Quét Biến Số để tải mức rủi ro đó vào Mô Hình Kinh Doanh và Bảng Phân Lớp (Stratified) phía dưới."
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section5": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "5. Mô Hình Kinh Doanh (Business Model Calculator)",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Trading Velocity (T/Day):</b> Tốc độ giao dịch. Tổng số lệnh bạn vào mỗi ngày trên toàn bộ các tài khoản.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Target Funded Slots:</b> Số lượng tài khoản Funded bạn muốn duy trì đồng thời (thường dùng chung với trade copier).",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Pass Pending Buffer:</b> Hàng đợi dự phòng. Số tài khoản Eval đã thi đậu, chờ sẵn để kích hoạt ngay lập tức khi một tài khoản Funded đang chạy bị cháy.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Business Metrics:</b> Hệ thống sẽ tính toán chi phí hàng tháng (tiền thi quỹ), doanh thu ước tính, ROI, và lợi nhuận ròng hàng tháng của mô hình này."
/* eslint-disable @typescript-eslint/no-require-imports */
    ]
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section6": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "6. Stratified & Workflow (Đa Cấp Độ & Dòng Chảy)",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Phân Lớp Rủi Ro (Stratified):</b> So sánh hiệu quả của việc thay đổi Rủi Ro giữa giai đoạn Eval (đánh rủi ro cao để qua nhanh) và giai đoạn Funded (hạ rủi ro để sống sót lâu dài). Click đúp vào một hàng để tính toán lại Business Model.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Mô Phỏng Nhật Ký (Workflow):</b> Trình bày quy trình làm việc theo từng ngày dưới dạng văn bản (Day 1, Day 2...), giúp bạn hình dung rõ hành trình của tài khoản từ lúc bắt đầu đến khi cháy hoặc nhận Payout."
/* eslint-disable @typescript-eslint/no-require-imports */
    ],
/* eslint-disable @typescript-eslint/no-require-imports */
    "warning": "⚠️ <b>Lưu ý Quản trị:</b> Không có mô phỏng nào thay thế được tính kỷ luật thực tế. Hãy luôn gắn chặt với giới hạn Daily Stop Loss để biến số liệu mô phỏng thành hiện thực."
/* eslint-disable @typescript-eslint/no-require-imports */
  }
/* eslint-disable @typescript-eslint/no-require-imports */
};
/* eslint-disable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-require-imports */
enData.Simulator.guide = {
/* eslint-disable @typescript-eslint/no-require-imports */
  "title": "📖 Detailed User Guide - Elite Quant Optimizer",
/* eslint-disable @typescript-eslint/no-require-imports */
  "newWindow": "↗ New Window",
/* eslint-disable @typescript-eslint/no-require-imports */
  "subtitle": "An advanced probability calculator, risk management optimizer, and Prop Trading business simulator.",
/* eslint-disable @typescript-eslint/no-require-imports */
  "section1": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "1. System Overview",
/* eslint-disable @typescript-eslint/no-require-imports */
    "p1": "Elite Quant Optimizer is not just a basic spreadsheet. It is an advanced Monte Carlo simulator designed to help you accurately quantify your survival rate and profitability when trading for Prop Firms (Topstep, Bulenox, APEX...). By simulating thousands of market scenarios based on your system's metrics, it helps you stop guessing and start making mathematically sound decisions."
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section2": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "2. Fund Rules Setup",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Preset:</b> Quickly load rulesets from popular prop firms. For example, Topstep 50k automatically sets a 50k balance, 3k target, and 2k drawdown.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Balance & Targets ($):</b> Initial account balance, Eval Target to pass the challenge, and the safe Payout Target to secure your first withdrawal.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Eval Consistency (%):</b> Daily profit consistency rule. If a firm restricts a single day from making up more than 50% of your total profit, the simulator will dynamically force extra trading days to dilute huge winning days.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Max Drawdown & DD Type:</b> Calculates your account's pain tolerance. Trailing Drawdown trails your highest peak (highly restrictive), whereas Static Drawdown is fixed from your starting balance.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Payout Rule:</b> How you qualify for a withdrawal. 'Standard' (e.g., 5 days of $150+ wins) or 'Consistency' (no single day exceeds 40% of the withdrawal amount)."
/* eslint-disable @typescript-eslint/no-require-imports */
    ]
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section3": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "3. Strategy Engine",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Winrate (%):</b> The true historical win rate of your trading system. Enter a realistic number based on backtesting or journaling.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Reward/Risk (X):</b> The R:R ratio. For instance, a 1.5 R:R means you gain $150 for every $100 you risk.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Daily Stop ($) & Daily Target ($):</b> Crucial safety switches. The simulator will automatically halt trading for the day if either threshold is hit, accurately modeling the discipline needed to prevent 'tilt'."
/* eslint-disable @typescript-eslint/no-require-imports */
    ]
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section4": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "4. Sweep Variable & Analytics",
/* eslint-disable @typescript-eslint/no-require-imports */
    "p1": "Instead of testing blindly, this feature runs bulk simulations across a range of values (Risk, Winrate, R:R) to map out your optimal performance curve:",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Min / Max / Step:</b> Set the boundaries for the sweep. E.g., Sweep risk per trade from $100 to $500 in $50 increments.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Eval Pass%:</b> The mathematical probability of passing the challenge.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Payout Pass%:</b> The true probability of surviving the evaluation AND lasting long enough to secure the first payout.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Expected Value (EV):</b> The mathematical expectancy per trade."
/* eslint-disable @typescript-eslint/no-require-imports */
    ],
/* eslint-disable @typescript-eslint/no-require-imports */
    "tip": "💡 <b>Interactive Tip:</b> Click on any row in the Sweep Variable results table to load that specific risk level into the Business Model and Stratified Analysis panels below."
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section5": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "5. Business Model Calculator",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Trading Velocity (T/Day):</b> The total number of trades you execute daily across all accounts.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Target Funded Slots:</b> The number of Funded accounts you intend to manage concurrently (often via a trade copier).",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Pass Pending Buffer:</b> Your backup queue. The number of passed Eval accounts kept in reserve to immediately replace any active Funded account that blows up.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Business Metrics:</b> The system aggregates evaluation fees, estimated revenue, ROI, and net monthly profit to evaluate your operation as a business."
/* eslint-disable @typescript-eslint/no-require-imports */
    ]
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section6": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "6. Stratified Risk & Workflow Simulation",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Stratified Risk:</b> Compares the impact of shifting risk profiles (e.g., high risk during Eval for speed, low risk during Funded for survival). Double-click a row to recalculate the Business Model.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "<b>Workflow Journal:</b> Presents the simulated workflow day-by-day in text format (Day 1, Day 2...), helping you visualize the realistic journey of an account from day one to bust or payout."
/* eslint-disable @typescript-eslint/no-require-imports */
    ],
/* eslint-disable @typescript-eslint/no-require-imports */
    "warning": "⚠️ <b>Management Warning:</b> No simulation can replace real discipline. Strictly adhere to your Daily Stop Loss to ensure real-world results align with these projections."
/* eslint-disable @typescript-eslint/no-require-imports */
  }
/* eslint-disable @typescript-eslint/no-require-imports */
};
/* eslint-disable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-require-imports */
fs.writeFileSync(viPath, JSON.stringify(viData, null, 2) + '\n');
/* eslint-disable @typescript-eslint/no-require-imports */
fs.writeFileSync(enPath, JSON.stringify(enData, null, 2) + '\n');
/* eslint-disable @typescript-eslint/no-require-imports */
console.log('Detailed Guide Applied with HTML tags');
