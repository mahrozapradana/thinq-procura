import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import VendorRegister from "@/pages/VendorRegister";
import Dashboard from "@/pages/Dashboard";
import MasterData from "@/pages/MasterData";
import UsersPage from "@/pages/Users";
import Budgets from "@/pages/Budgets";
import ApprovalSettings from "@/pages/ApprovalSettings";
import PurchaseRequests from "@/pages/PurchaseRequests";
import PurchaseOrders from "@/pages/PurchaseOrders";
import Tenders from "@/pages/Tenders";
import Inventory from "@/pages/Inventory";
import VendorsMgmt from "@/pages/VendorsMgmt";
import CustomsDocuments from "@/pages/CustomsDocuments";
import WarehouseStock from "@/pages/WarehouseStock";
import InvoicesFinance from "@/pages/InvoicesFinance";
import SettingsPage from "@/pages/SettingsPage";
import {
  VendorHome, VendorTenders, VendorPOs, VendorRFQs, VendorShipments, VendorInvoices, VendorLS, VendorProfile,
} from "@/pages/VendorPortal";
import "@/App.css";

function RoleRoot() {
  const { user } = useAuth();
  if (user?.role === "vendor") return <Navigate to="/vendor" replace />;
  return <Dashboard />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/vendor-register" element={<VendorRegister />} />

          {/* Internal */}
          <Route path="/" element={<ProtectedRoute><Layout><RoleRoot/></Layout></ProtectedRoute>} />
          <Route path="/pr" element={<ProtectedRoute><Layout><PurchaseRequests/></Layout></ProtectedRoute>} />
          <Route path="/po" element={<ProtectedRoute><Layout><PurchaseOrders/></Layout></ProtectedRoute>} />
          <Route path="/tenders" element={<ProtectedRoute><Layout><Tenders/></Layout></ProtectedRoute>} />
          <Route path="/vendors-mgmt" element={<ProtectedRoute><Layout><VendorsMgmt/></Layout></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute><Layout><Inventory/></Layout></ProtectedRoute>} />
          <Route path="/customs" element={<ProtectedRoute><Layout><CustomsDocuments/></Layout></ProtectedRoute>} />
          <Route path="/stock" element={<ProtectedRoute><Layout><WarehouseStock/></Layout></ProtectedRoute>} />
          <Route path="/invoices" element={<ProtectedRoute><Layout><InvoicesFinance/></Layout></ProtectedRoute>} />
          <Route path="/masters" element={<ProtectedRoute><Layout><MasterData/></Layout></ProtectedRoute>} />
          <Route path="/budgets" element={<ProtectedRoute><Layout><Budgets/></Layout></ProtectedRoute>} />
          <Route path="/approvals" element={<ProtectedRoute><Layout><ApprovalSettings/></Layout></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute roles={["admin"]}><Layout><UsersPage/></Layout></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Layout><SettingsPage/></Layout></ProtectedRoute>} />

          {/* Vendor portal */}
          <Route path="/vendor" element={<ProtectedRoute roles={["vendor"]}><Layout><VendorHome/></Layout></ProtectedRoute>} />
          <Route path="/vendor/tenders" element={<ProtectedRoute roles={["vendor"]}><Layout><VendorTenders/></Layout></ProtectedRoute>} />
          <Route path="/vendor/rfqs" element={<ProtectedRoute roles={["vendor"]}><Layout><VendorRFQs/></Layout></ProtectedRoute>} />
          <Route path="/vendor/pos" element={<ProtectedRoute roles={["vendor"]}><Layout><VendorPOs/></Layout></ProtectedRoute>} />
          <Route path="/vendor/shipments" element={<ProtectedRoute roles={["vendor"]}><Layout><VendorShipments/></Layout></ProtectedRoute>} />
          <Route path="/vendor/invoices" element={<ProtectedRoute roles={["vendor"]}><Layout><VendorInvoices/></Layout></ProtectedRoute>} />
          <Route path="/vendor/ls" element={<ProtectedRoute roles={["vendor"]}><Layout><VendorLS/></Layout></ProtectedRoute>} />
          <Route path="/vendor/profile" element={<ProtectedRoute roles={["vendor"]}><Layout><VendorProfile/></Layout></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
