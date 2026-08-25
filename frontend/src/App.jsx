import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Layout from "./components/Layout.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import BillingHistory from "./pages/BillingHistory.jsx";
import Quotations from "./pages/Quotations.jsx";
import Invoices from "./pages/Invoices.jsx";
import Bills from "./pages/Bills.jsx";
import Customers from "./pages/Customers.jsx";
import Products from "./pages/Products.jsx";
import CompanyProfile from "./pages/CompanyProfile.jsx";
import Subscription from "./pages/Subscription.jsx";
import Admin from "./pages/Admin.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public pages */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />

        {/* Protected application */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/billing-history" element={<BillingHistory />} />
          <Route path="/quotations" element={<Quotations />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/products" element={<Products />} />
          <Route path="/company-profile" element={<CompanyProfile />} />
          <Route path="/subscription" element={<Subscription />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
