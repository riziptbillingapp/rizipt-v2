import { useEffect, useState } from "react";
import { api } from "../api/client.js";

export function useCompanyProfile() {
  const [company, setCompany] = useState(null);

  useEffect(() => {
    api.getCompany()
      .then(setCompany)
      .catch(() => {});
  }, []);

  return { company };
}
