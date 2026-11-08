// Form-permission tests do not mount read-only cards or invoke the print flow.
const ar = Object.fromEntries(["DeliveryOrder", "Invoice", "Billing", "Receipt", "Credit"].map(name => [`${name}Information`, () => null]));
const ap = Object.fromEntries(["ContractorPayment", "PaymentVoucher", "ChequePayment", "SupplierBill"].map(name => [`${name}Information`, () => null]));
const inventory = Object.fromEntries(["GoodsReceipt", "StockIssue", "StockReturn", "StockOpening", "StockTransfer"].map(name => [`${name}Information`, () => null]));
module.exports = {
  "@/components/ar-document-information": ar,
  "@/components/ap-document-information": ap,
  "./ap-document-information": ap,
  "@/components/inventory-document-information": inventory,
  "./inventory-document-information": inventory,
  "@/components/use-accounting-document-print": {
    useAccountingDocumentPrint: () => ({ printing: false, error: "", printContent: null, reset() {} }),
  },
};
