const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

const get = (path) => request(path);
const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body ?? {}) });
const put = (path, body) => request(path, { method: "PUT", body: JSON.stringify(body ?? {}) });
const patch = (path, body) => request(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
const del = (path) => request(path, { method: "DELETE" });

export const api = {
  // Company profile
  getCompany: () => get("/api/company-profile"),
  updateCompany: (body) => put("/api/company-profile", body),

  // Customers
  listCustomers: (search) => get(`/api/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getCustomer: (id) => get(`/api/customers/${id}`),
  createCustomer: (body) => post("/api/customers", body),
  updateCustomer: (id, body) => put(`/api/customers/${id}`, body),
  archiveCustomer: (id) => del(`/api/customers/${id}`),

  // Products
  listProducts: (search, itemType) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (itemType) params.set("item_type", itemType);
    const qs = params.toString();
    return get(`/api/products${qs ? `?${qs}` : ""}`);
  },
  getProduct: (id) => get(`/api/products/${id}`),
  createProduct: (body) => post("/api/products", body),
  updateProduct: (id, body) => put(`/api/products/${id}`, body),
  archiveProduct: (id) => del(`/api/products/${id}`),
  importProducts: (items) => post("/api/products/import", { items }),

  // Quotations
  listQuotations: () => get("/api/quotations"),
  getQuotation: (id) => get(`/api/quotations/${id}`),
  createQuotation: (body) => post("/api/quotations", body),
  updateQuotation: (id, body) => put(`/api/quotations/${id}`, body),
  approveQuotation: (id) => patch(`/api/quotations/${id}/approve`),
  rejectQuotation: (id) => patch(`/api/quotations/${id}/reject`),
  convertQuotationToInvoice: (id, body) => post(`/api/quotations/${id}/convert-to-invoice`, body),
  deleteQuotation: (id) => del(`/api/quotations/${id}`),

  // Invoices
  listInvoices: () => get("/api/invoices"),
  getInvoice: (id) => get(`/api/invoices/${id}`),
  createInvoice: (body) => post("/api/invoices", body),
  updateInvoice: (id, body) => put(`/api/invoices/${id}`, body),
  approveInvoice: (id) => patch(`/api/invoices/${id}/approve`),
  rejectInvoice: (id) => patch(`/api/invoices/${id}/reject`),
  convertInvoiceToBill: (id, body) => post(`/api/invoices/${id}/convert-to-bill`, body),
  deleteInvoice: (id) => del(`/api/invoices/${id}`),

  // Bills / receipts
  listBills: () => get("/api/bills"),
  getBill: (id) => get(`/api/bills/${id}`),
  createBill: (body) => post("/api/bills", body),
  updateBill: (id, body) => put(`/api/bills/${id}`, body),
  voidBill: (id) => patch(`/api/bills/${id}/void`),
  deleteBill: (id) => del(`/api/bills/${id}`),

  // Billing history
  listHistory: (customerId) => get(`/api/billing-history${customerId ? `?customer_id=${customerId}` : ""}`),
  getChain: (type, id) => get(`/api/billing-history/chain/${type}/${id}`),

    // Letterheads
  listLetterheads: () => get("/api/letterheads"),
  getLetterhead: (id) => get(`/api/letterheads/${id}`),
  createLetterhead: (body) => post("/api/letterheads", body),
  updateLetterhead: (id, body) => put(`/api/letterheads/${id}`, body),
  deleteLetterhead: (id) => del(`/api/letterheads/${id}`),

  // Project Status Reports
  listProjectStatusReports: () => get("/api/project-status-reports"),
  getProjectStatusReport: (id) => get(`/api/project-status-reports/${id}`),
  createProjectStatusReport: (body) => post("/api/project-status-reports", body),
  updateProjectStatusReport: (id, body) =>
    put(`/api/project-status-reports/${id}`, body),
  deleteProjectStatusReport: (id) =>
    del(`/api/project-status-reports/${id}`),

  // Auth  
  me: () => get("/api/auth/me"),
  logout: () => post("/api/auth/logout"),
  googleLoginUrl: () => `${BASE_URL}/api/auth/google/start`,

  // Subscription / billing
  getBillingStatus: () => get("/api/billing/status"),
  submitPaymentClaim: (body) => post("/api/billing/claim", body),
  adminListClaims: () => get("/api/billing/admin/claims"),
  adminApproveClaim: (id) => patch(`/api/billing/admin/claims/${id}/approve`),
  adminRejectClaim: (id) => patch(`/api/billing/admin/claims/${id}/reject`),
};

