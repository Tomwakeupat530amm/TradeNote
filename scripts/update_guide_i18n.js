/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
/* eslint-disable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-require-imports */
const viPath = 'messages/vi.json';
/* eslint-disable @typescript-eslint/no-require-imports */
const enPath = 'messages/en.json';
/* eslint-disable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-require-imports */
const viData = JSON.parse(fs.readFileSync(viPath, 'utf8'));
/* eslint-disable @typescript-eslint/no-require-imports */
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
/* eslint-disable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-require-imports */
viData.Simulator.guide = {
/* eslint-disable @typescript-eslint/no-require-imports */
  "title": "📖 Hướng Dẫn Sử Dụng - Elite Quant Optimizer",
/* eslint-disable @typescript-eslint/no-require-imports */
  "newWindow": "↗ Cửa sổ mới",
/* eslint-disable @typescript-eslint/no-require-imports */
  "subtitle": "Công cụ tính toán & tối ưu hóa xác suất thi quỹ, quản trị rủi ro & mô phỏng kinh doanh Trading.",
/* eslint-disable @typescript-eslint/no-require-imports */
  "section1": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "1. Tổng Quan Công Cụ",
/* eslint-disable @typescript-eslint/no-require-imports */
    "p1": "Elite Quant Optimizer giúp trader định lượng chính xác khả năng thi đỗ các quỹ Prop Firm (như Topstep, Bulenox...), tính toán tỷ lệ Pass/Bust, tìm ra mức Risk hợp lý nhất và dự phóng bài toán kinh doanh nhiều tài khoản Funded cùng lúc."
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section2": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "2. Thiết Lập Quy Tắc Quỹ (Fund Rules)",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "Preset: Chọn nhanh cấu hình quy tắc của các quỹ phổ biến hoặc chọn Custom để tự nhập.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Balance ($): Số vốn ban đầu của tài khoản (ví dụ $50,000).",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Eval Target ($): Mục tiêu lợi nhuận cần đạt để vượt qua vòng thử thách.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Payout Target ($): Mục tiêu lợi nhuận để được rút tiền ở tài khoản Funded.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Eval Consistency (%): Quy tắc nhất quán lợi nhuận tối đa 1 ngày (ví dụ 50% hoặc 40%).",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Max Drawdown ($) & DD Type: Sức chịu đựng tối đa của tài khoản (Trailing Drawdown hoặc Static Drawdown).",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Payout Rule: Chọn giữa Standard (5 ngày $150+) hoặc Consistency (Quy tắc 40%, 3 ngày)."
/* eslint-disable @typescript-eslint/no-require-imports */
    ]
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section3": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "3. Thiết Lập Động Cơ Chiến Lược (Strategy Engine)",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "Winrate (%): Tỷ lệ thắng trung bình của hệ thống giao dịch.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Reward/Risk (X): Tỷ lệ Thưởng / Rủi ro (R:R).",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Max Trades: Số lượng lệnh tối đa kiểm thử trong chu kỳ.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Daily Stop ($) & Daily Target ($): Giới hạn cắt lỗ tối đa & chốt lời mục tiêu trong ngày."
/* eslint-disable @typescript-eslint/no-require-imports */
    ]
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section4": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "4. Quét Biến Số (Sweep Variable) & Tối Ưu Hóa",
/* eslint-disable @typescript-eslint/no-require-imports */
    "p1": "Tính năng này giúp bạn thử nghiệm nhiều mức Rủi ro (Risk $), Tỷ lệ thắng (Winrate %) hoặc R:R để xem kết quả tối ưu nhất:",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "Min / Max / Step: Chọn giá trị bắt đầu, kết thúc và bước nhảy để phân tích.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Bảng kết quả sẽ hiển thị chi tiết: Eval Pass%, Payout Pass%, Bust Rate%, số lệnh trung bình và Expected Value (Kỳ vọng lợi nhuận)."
/* eslint-disable @typescript-eslint/no-require-imports */
    ],
/* eslint-disable @typescript-eslint/no-require-imports */
    "tip": "💡 Mẹo: Nhấp vào một dòng trong bảng kết quả để chọn mức Risk đó làm mảng chạy Mô hình kinh doanh phía dưới."
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section5": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "5. Mô Hình Kinh Doanh (Business & Funded Slots)",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "Trading Velocity (T/Day): Tổng số lệnh giao dịch mỗi ngày.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Target Funded Slots: Số tài khoản Funded mục tiêu duy trì cùng lúc (ví dụ 5 slots).",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Pass Pending Buffer: Số lượng tài khoản đã thi pass sẵn sàng trám vào khi tài khoản funded bị cháy (bust).",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Eval Fee / Act Fee / Payout Size: Phí thi eval, phí kích hoạt và quy mô mỗi lần rút tiền."
/* eslint-disable @typescript-eslint/no-require-imports */
    ]
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section6": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "6. Mô Phỏng Monte Carlo & Xuất Báo Cáo",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "Mô phỏng nhật ký 20 ngày: Hệ thống tự động giả lập luồng đánh thực tế theo ngày, theo dõi từng lệnh WIN/LOSS/BUST/PAYOUT của các tài khoản slot.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Export CSV: Nút xuất toàn bộ dữ liệu cấu hình, bảng kết quả tối ưu & bài toán kinh doanh ra file CSV."
/* eslint-disable @typescript-eslint/no-require-imports */
    ],
/* eslint-disable @typescript-eslint/no-require-imports */
    "warning": "⚠️ Lưu ý: Quản trị rủi ro là chìa khóa hàng đầu để tồn tại trong prop trading. Luôn tuân thủ Daily Stop & Max Drawdown của quỹ."
/* eslint-disable @typescript-eslint/no-require-imports */
  }
/* eslint-disable @typescript-eslint/no-require-imports */
};
/* eslint-disable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-require-imports */
enData.Simulator.guide = {
/* eslint-disable @typescript-eslint/no-require-imports */
  "title": "📖 User Guide - Elite Quant Optimizer",
/* eslint-disable @typescript-eslint/no-require-imports */
  "newWindow": "↗ New Window",
/* eslint-disable @typescript-eslint/no-require-imports */
  "subtitle": "A tool to calculate prop firm passing probabilities, optimize risk management & simulate trading business operations.",
/* eslint-disable @typescript-eslint/no-require-imports */
  "section1": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "1. Tool Overview",
/* eslint-disable @typescript-eslint/no-require-imports */
    "p1": "Elite Quant Optimizer helps traders accurately quantify the probability of passing Prop Firms (like Topstep, Bulenox...), calculate Pass/Bust rates, find the optimal Risk level, and project the business model of running multiple Funded accounts simultaneously."
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section2": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "2. Fund Rules Setup",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "Preset: Quickly choose rules from popular prop firms or select Custom to enter manually.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Balance ($): Initial account balance (e.g., $50,000).",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Eval Target ($): Profit target required to pass the evaluation phase.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Payout Target ($): Profit target to be eligible for a payout in a Funded account.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Eval Consistency (%): Maximum daily profit consistency rule (e.g., 50% or 40%).",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Max Drawdown ($) & DD Type: Maximum drawdown limit of the account (Trailing Drawdown or Static Drawdown).",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Payout Rule: Choose between Standard (5 days $150+) or Consistency (40% rule, 3 days)."
/* eslint-disable @typescript-eslint/no-require-imports */
    ]
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section3": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "3. Strategy Engine Setup",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "Winrate (%): Average win rate of your trading system.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Reward/Risk (X): Reward to Risk ratio (R:R).",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Max Trades: Maximum number of trades to simulate per cycle.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Daily Stop ($) & Daily Target ($): Maximum daily loss limit & daily profit target."
/* eslint-disable @typescript-eslint/no-require-imports */
    ]
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section4": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "4. Sweep Variable & Optimization",
/* eslint-disable @typescript-eslint/no-require-imports */
    "p1": "This feature helps you test multiple levels of Risk ($), Winrate (%), or R:R to find the optimal result:",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "Min / Max / Step: Select the starting value, ending value, and step size for analysis.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "The results table will display in detail: Eval Pass%, Payout Pass%, Bust Rate%, average number of trades, and Expected Value."
/* eslint-disable @typescript-eslint/no-require-imports */
    ],
/* eslint-disable @typescript-eslint/no-require-imports */
    "tip": "💡 Tip: Click on a row in the results table to select that Risk level for the Business Model calculator below."
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section5": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "5. Business Model & Funded Slots",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "Trading Velocity (T/Day): Total number of trades taken per day.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Target Funded Slots: Number of Funded accounts you aim to maintain simultaneously (e.g., 5 slots).",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Pass Pending Buffer: Number of passed accounts ready to replace busted funded accounts.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Eval Fee / Act Fee / Payout Size: Evaluation fee, activation fee, and the size of each payout."
/* eslint-disable @typescript-eslint/no-require-imports */
    ]
/* eslint-disable @typescript-eslint/no-require-imports */
  },
/* eslint-disable @typescript-eslint/no-require-imports */
  "section6": {
/* eslint-disable @typescript-eslint/no-require-imports */
    "title": "6. Monte Carlo Simulation & Exporting",
/* eslint-disable @typescript-eslint/no-require-imports */
    "items": [
/* eslint-disable @typescript-eslint/no-require-imports */
      "20-day Log Simulation: The system automatically simulates a real daily trading flow, tracking each WIN/LOSS/BUST/PAYOUT trade of the slot accounts.",
/* eslint-disable @typescript-eslint/no-require-imports */
      "Export CSV: Export all configuration data, optimization results, and business model calculations to a CSV file."
/* eslint-disable @typescript-eslint/no-require-imports */
    ],
/* eslint-disable @typescript-eslint/no-require-imports */
    "warning": "⚠️ Note: Risk management is the ultimate key to surviving in prop trading. Always adhere to the firm's Daily Stop & Max Drawdown rules."
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
console.log('Done');
