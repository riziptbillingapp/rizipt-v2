import { api } from "./client.js";

export const letterheadsApi = {
  list: () => api.listLetterheads(),
  get: (id) => api.getLetterhead(id),
  create: (data) => api.createLetterhead(data),
  update: (id, data) => api.updateLetterhead(id, data),
  remove: (id) => api.deleteLetterhead(id),
};

export const projectStatusReportsApi = {
  list: () => api.listProjectStatusReports(),
  get: (id) => api.getProjectStatusReport(id),
  create: (data) => api.createProjectStatusReport(data),
  update: (id, data) => api.updateProjectStatusReport(id, data),
  remove: (id) => api.deleteProjectStatusReport(id),
};
