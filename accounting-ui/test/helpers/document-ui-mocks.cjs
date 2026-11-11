// Form-permission tests do not mount read-only cards or invoke the print flow.
const ar = Object.fromEntries(["DeliveryOrder", "Invoice", "Billing", "Receipt", "Credit"].map(name => [`${name}Information`, () => null]));
const ap = Object.fromEntries(["ContractorPayment", "PaymentVoucher", "ChequePayment", "SupplierBill"].map(name => [`${name}Information`, () => null]));
const inventory = Object.fromEntries(["GoodsReceipt", "StockIssue", "StockReturn", "StockOpening", "StockTransfer"].map(name => [`${name}Information`, () => null]));
const companyDetailsModule = { exports: {} };
const companyDetailsSource = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "src", "lib", "company-print-details.ts"), "utf8");
const companyDetailsJs = require("typescript").transpileModule(companyDetailsSource, { compilerOptions: { module: require("typescript").ModuleKind.CommonJS } }).outputText;
require("node:vm").runInNewContext(companyDetailsJs, { module: companyDetailsModule, exports: companyDetailsModule.exports });
const invoiceDescriptionModule = { exports: {} };
const invoiceDescriptionSource = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "src", "lib", "invoice-description.ts"), "utf8");
const invoiceDescriptionJs = require("typescript").transpileModule(invoiceDescriptionSource, { compilerOptions: { module: require("typescript").ModuleKind.CommonJS } }).outputText;
require("node:vm").runInNewContext(invoiceDescriptionJs, { module: invoiceDescriptionModule, exports: invoiceDescriptionModule.exports });
module.exports = {
  "@/lib/company-print-details": companyDetailsModule.exports,
  "@/lib/invoice-description": invoiceDescriptionModule.exports,
  "@/components/ar-document-information": ar,
  "@/components/ap-document-information": ap,
  "./ap-document-information": ap,
  "@/components/inventory-document-information": inventory,
  "./inventory-document-information": inventory,
  "@/components/use-accounting-document-print": {
    useAccountingDocumentPrint: () => ({ printing: false, error: "", printContent: null, reset() {} }),
  },
};
