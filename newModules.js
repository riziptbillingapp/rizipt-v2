// api/newModules.js
// Add these to your existing api client (client.js) the same way
// quotations/invoices are wired up. `request` below stands in for
// whatever helper you already use (fetch wrapper with VITE_API_URL
// base + auth cookie credentials: 'include').

import { request } from './client'; // <-- adjust to your real helper name

export const letterheadsApi = {
  list: () => request('/api/letterheads'),
  get: (id) => request(`/api/letterheads/${id}`),
  create: (data) => request('/api/letterheads', { method: 'POST', body: data }),
  update: (id, data) => request(`/api/letterheads/${id}`, { method: 'PUT', body: data }),
  remove: (id) => request(`/api/letterheads/${id}`, { method: 'DELETE' }),
};

export const projectStatusReportsApi = {
  list: () => request('/api/project-status-reports'),
  get: (id) => request(`/api/project-status-reports/${id}`),
  create: (data) => request('/api/project-status-reports', { method: 'POST', body: data }),
  update: (id, data) =>
    request(`/api/project-status-reports/${id}`, { method: 'PUT', body: data }),
  remove: (id) => request(`/api/project-status-reports/${id}`, { method: 'DELETE' }),
};
