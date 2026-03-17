import { useState, useCallback } from "react";

export type FinanceLang = "en" | "zh";

const translations: Record<string, Record<FinanceLang, string>> = {
  // Page titles
  "invoiceFinancing": { en: "Invoice Financing", zh: "发票融资" },
  "poFinancingTracker": { en: "PO Financing Tracker", zh: "采购订单融资追踪" },
  "financeTrackingPlatform": { en: "Finance Tracking Platform", zh: "融资跟踪平台" },

  // Summary cards
  "activeFinanced": { en: "Active Financed", zh: "融资总额" },
  "armorpakOutstanding": { en: "Armropak Outstanding", zh: "未偿还金额" },
  "requiredDeposit": { en: "Required Deposit (10%)", zh: "应缴保证金 (10%)" },
  "depositBalance": { en: "Deposit Balance", zh: "保证金余额" },
  "depositShortfall": { en: "Deposit Shortfall", zh: "保证金缺口" },
  "totalRepaid": { en: "Total Repaid", zh: "已还款总额" },
  "totalFinanced": { en: "Total Financed", zh: "融资总额" },
  "totalOutstanding": { en: "Outstanding", zh: "未偿还金额" },

  // Tabs
  "pending": { en: "Pending", zh: "待处理" },
  "active": { en: "Active", zh: "活跃" },
  "completed": { en: "Completed", zh: "已完成" },
  "confirmations": { en: "Confirmations", zh: "确认" },

  // Table headers
  "vendorPO": { en: "Vendor PO", zh: "供应商PO" },
  "description": { en: "Description", zh: "描述" },
  "invoice": { en: "Invoice", zh: "发票编号" },
  "financed": { en: "Financed", zh: "融资金额" },
  "financedAmountRMB": { en: "Financed (¥)", zh: "融资金额 (¥)" },
  "date": { en: "Date", zh: "日期" },
  "aging": { en: "Aging", zh: "账龄" },
  "fee": { en: "Fee", zh: "手续费" },
  "feeRMB": { en: "Fee (¥)", zh: "手续费 (¥)" },
  "repaid": { en: "Repaid", zh: "已还款" },
  "repaidRMB": { en: "Repaid (¥)", zh: "已还款 (¥)" },
  "balance": { en: "Balance", zh: "余额" },
  "balanceRMB": { en: "Balance (¥)", zh: "余额 (¥)" },
  "amount": { en: "Amount", zh: "金额" },
  "submitted": { en: "Submitted", zh: "提交日期" },
  "status": { en: "Status", zh: "状态" },
  "method": { en: "Method", zh: "方式" },
  "reference": { en: "Reference", zh: "参考号" },
  "notes": { en: "Notes", zh: "备注" },
  "feeTier": { en: "Rate", zh: "费率" },
  "financedDate": { en: "Financed Date", zh: "融资日期" },

  // Buttons
  "shareLink": { en: "Share Link", zh: "分享链接" },
  "recordDeposit": { en: "Record Deposit", zh: "记录保证金" },
  "submitForFinancing": { en: "Submit for Financing", zh: "提交融资" },
  "repay": { en: "Repay", zh: "还款" },
  "accept": { en: "Accept", zh: "接受" },
  "export": { en: "Export", zh: "导出" },
  "confirm": { en: "Confirm", zh: "确认" },
  "dispute": { en: "Dispute", zh: "争议" },
  "cancel": { en: "Cancel", zh: "取消" },
  "submitDispute": { en: "Submit Dispute", zh: "提交争议" },
  "clear": { en: "Clear", zh: "清除" },

  // Status badges
  "waiting": { en: "Waiting", zh: "等待中" },
  "paid": { en: "Paid", zh: "已结清" },
  "confirmed": { en: "Confirmed", zh: "已确认" },
  "disputed": { en: "Disputed", zh: "已争议" },
  "pendingStatus": { en: "Pending", zh: "待确认" },
  "needsPO": { en: "Needs PO", zh: "需要PO" },

  // Labels
  "depositHistory": { en: "Deposit History", zh: "保证金记录" },
  "noDeposits": { en: "No deposits yet", zh: "暂无保证金记录" },
  "noPending": { en: "No pending requests", zh: "暂无待处理请求" },
  "noActive": { en: "No active financed invoices", zh: "暂无活跃融资记录" },
  "noCompleted": { en: "No completed entries", zh: "暂无已完成记录" },
  "noFinanceRecords": { en: "No finance records", zh: "暂无融资记录" },
  "searchPlaceholder": { en: "Search PO, description, customer...", zh: "搜索PO、描述、客户..." },
  "from": { en: "From", zh: "从" },
  "to": { en: "To", zh: "至" },
  "days": { en: "d", zh: "天" },
  "contactAdmin": { en: "Please contact an admin for a new link", zh: "请联系管理员获取新链接" },
  "invalidLink": { en: "Invalid link", zh: "无效的链接" },
  "linkExpired": { en: "Link is invalid or expired", zh: "链接无效或已过期" },

  // Confirmations tab
  "repaymentConfirmations": { en: "Armorpak Payment Confirmations — Repayments", zh: "Armorpak付款确认 — 还款" },
  "depositsSection": { en: "Deposits", zh: "保证金" },
  "noRepayments": { en: "No repayments to confirm", zh: "暂无还款待确认" },
  "noDepositsConfirm": { en: "No deposits to confirm", zh: "暂无保证金待确认" },
  "disputeThis": { en: "Dispute this", zh: "对此提出争议" },
  "disputeReason": { en: "Reason for dispute...", zh: "争议原因..." },
  "disputeExplain": { en: "Explain why this payment doesn't match your records.", zh: "请说明为何此付款与您的记录不符。" },

  // Accept dialog
  "acceptProcessRequest": { en: "Accept & Process Request", zh: "接受并处理请求" },
  "acceptDesc": { en: "Confirm the financing details. The request will move to Active and aging/fees will start from the financed date.", zh: "确认融资详情。请求将转为活跃状态，账龄和费用将从融资日期开始计算。" },
  "financedAmountUSD": { en: "Financed Amount (USD)", zh: "融资金额 (USD)" },
  "exchangeRate": { en: "Exchange Rate (USD → RMB)", zh: "汇率 (USD → RMB)" },
  "rmbAmount": { en: "RMB Amount", zh: "人民币金额" },
  "financedDateWhenPaid": { en: "Financed Date (when paid)", zh: "融资日期 (付款日)" },
  "invoiceNumber": { en: "Invoice Number", zh: "发票编号" },
  "yourInvoiceNumber": { en: "Your invoice #", zh: "您的发票号" },
  "sendNotification": { en: "Send email notification to Vibe admins", zh: "发送邮件通知给管理员" },
  "acceptActivate": { en: "Accept & Activate", zh: "接受并激活" },
  "addedByFinance": { en: "Added by finance company — needs vendor PO link", zh: "由融资公司添加 — 需要供应商PO链接" },
};

export function useFinanceLang() {
  const [lang, setLangState] = useState<FinanceLang>(() => {
    try {
      return (localStorage.getItem("finance-lang") as FinanceLang) || "en";
    } catch {
      return "en";
    }
  });

  const setLang = useCallback((l: FinanceLang) => {
    setLangState(l);
    try { localStorage.setItem("finance-lang", l); } catch {}
  }, []);

  const t = useCallback((key: string): string => {
    return translations[key]?.[lang] ?? key;
  }, [lang]);

  const toggleLang = useCallback(() => {
    const next = lang === "en" ? "zh" : "en";
    setLang(next);
  }, [lang, setLang]);

  return { lang, setLang, toggleLang, t };
}
