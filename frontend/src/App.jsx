import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import BillingHistory from "./pages/BillingHistory.jsx";
import Quotations from "./pages/Quotations.jsx";
import Invoices from "./pages/Invoices.jsx";
import Bills from "./pages/Bills.jsx";
import Customers from "./pages/Customers.jsx";
import Products from "./pages/Products.jsx";
import CompanyProfile from "./pages/CompanyProfile.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<BillingHistory />} />
        <Route path="/quotations" element={<Quotations />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/products" element={<Products />} />
        <Route path="/company-profile" element={<CompanyProfile />} />
      </Route>
    </Routes>
  );
}
