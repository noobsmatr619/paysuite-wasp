/** Shared input types for PaySuite operations */

export type LineItemInput = {
  productId: string;
  quantity: number;
  price: number;
};

export type TaxLineInput = {
  taxId: string;
  rate: number;
};

export type CustomerInput = {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phoneCountry?: string | null;
  phoneNumber?: string | null;
  taxNo?: string | null;
  companyName?: string | null;
  address?: string | null;
  status?: string;
  portalAccess?: boolean;
};

export type ProductInput = {
  name: string;
  price: number;
  code?: string | null;
  description?: string | null;
  categoryId?: string | null;
  unitId?: string | null;
};

export type InvoiceInput = {
  customerId: string;
  issueDate: string; // ISO date
  dueDate: string;
  referenceNumber?: string | null;
  discountType?: string;
  discountAmount?: number | null;
  note?: string | null;
  invoiceTemplate?: number;
  recurring?: boolean;
  lines: LineItemInput[];
  taxes?: TaxLineInput[];
  markAsSent?: boolean;
};

export type EstimateInput = {
  customerId: string;
  date: string;
  discountType?: string;
  discountAmount?: number | null;
  note?: string | null;
  estimateTemplate?: number;
  lines: LineItemInput[];
  taxes?: TaxLineInput[];
};

export type ExpenseInput = {
  title: string;
  date: string;
  amount: number;
  categoryId: string;
  reference?: string | null;
  note?: string | null;
};

export type TicketInput = {
  subject: string;
  departmentId: string;
  priorityId: string;
  body?: string | null;
};
