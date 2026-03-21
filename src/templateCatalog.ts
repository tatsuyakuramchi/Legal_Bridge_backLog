import { TemplateDefinition } from "./types.js";

export const templateCatalog: TemplateDefinition[] = [
  {
    key: "template_service_basic",
    name: "業務委託基本契約書",
    description: "業務委託向けの基本契約テンプレートです。",
    requiredFields: [],
    fileName: "template_service_basic.html"
  },
  {
    key: "template_license_basic",
    name: "ライセンス許諾基本契約書",
    description: "ライセンス契約用の基本テンプレートです。",
    requiredFields: [],
    fileName: "template_license_basic.html"
  },
  {
    key: "template_ledger_v5__1_",
    name: "ライセンス台帳",
    description: "ライセンス契約に添付する台帳テンプレートです。",
    requiredFields: [],
    fileName: "template_ledger_v5__1_.html"
  },
  {
    key: "template_nda",
    name: "秘密保持契約書",
    description: "NDA テンプレートです。",
    requiredFields: [],
    fileName: "template_nda.html"
  },
  {
    key: "template_order",
    name: "発注書",
    description: "通常の発注書テンプレートです。",
    requiredFields: [],
    fileName: "template_order.html"
  },
  {
    key: "template_order_planning",
    name: "企画発注書",
    description: "企画案件向け発注書テンプレートです。",
    requiredFields: [],
    fileName: "template_order_planning.html"
  },
  {
    key: "terms_spot_2026",
    name: "スポット条件書 2026",
    description: "基本契約がない場合に発注書へ合冊する条件書です。",
    requiredFields: [],
    fileName: "terms_spot_2026.html"
  },
  {
    key: "template_sales_buyer",
    name: "売買契約書（買手）",
    description: "買手向け売買契約テンプレートです。",
    requiredFields: [],
    fileName: "template_sales_buyer.html"
  },
  {
    key: "template_sales_seller_standard",
    name: "売買契約書（売手・標準）",
    description: "売手標準条件の売買契約テンプレートです。",
    requiredFields: [],
    fileName: "template_sales_seller_standard.html"
  },
  {
    key: "template_sales_seller_credit",
    name: "売買契約書（売手・掛売り）",
    description: "掛売り条件の売買契約テンプレートです。",
    requiredFields: [],
    fileName: "template_sales_seller_credit.html"
  },
  {
    key: "template_inspection_report",
    name: "検収書",
    description: "納品リクエスト向けの検収書テンプレートです。",
    requiredFields: [],
    fileName: "template_inspection_report.html"
  },
  {
    key: "template_royalty_report",
    name: "利用許諾料報告書",
    description: "利用許諾料の報告テンプレートです。",
    requiredFields: [],
    fileName: "template_royalty_report.html"
  },
  {
    key: "template_revenue_share_report",
    name: "レベニューシェア報告書",
    description: "レベニューシェアの報告テンプレートです。",
    requiredFields: [],
    fileName: "template_revenue_share_report.html"
  },
  {
    key: "template_payment_notice",
    name: "支払通知書兼仕入明細書",
    description: "納品系テンプレートに合冊する複合支払通知書です。",
    requiredFields: [],
    fileName: "template_payment_notice.html"
  }
];
