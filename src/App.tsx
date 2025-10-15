import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DashboardLayout } from "./components/DashboardLayout";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import EditProduct from "./pages/EditProduct";
import Inventory from "./pages/Inventory";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import CreateOrder from "./pages/CreateOrder";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import Artwork from "./pages/Artwork";
import RejectedArchive from "./pages/RejectedArchive";
import PullShip from "./pages/PullShip";
import PullShipOrderDetail from "./pages/PullShipOrderDetail";
import MyPOs from "./pages/MyPOs";
import Vendors from "./pages/Vendors";
import VendorPOs from "./pages/VendorPOs";
import VendorPODetail from "./pages/VendorPODetail";
import Production from "./pages/Production";
import ProductionDetail from "./pages/ProductionDetail";
import Login from "./pages/Login";
import VendorSignup from "./pages/VendorSignup";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/vendor-signup" element={<VendorSignup />} />
          <Route path="/dashboard" element={<DashboardLayout><Dashboard /></DashboardLayout>} />
          <Route path="/products" element={<DashboardLayout><Products /></DashboardLayout>} />
          <Route path="/products/edit/:id" element={<DashboardLayout><EditProduct /></DashboardLayout>} />
          <Route path="/inventory" element={<DashboardLayout><Inventory /></DashboardLayout>} />
          <Route path="/orders" element={<DashboardLayout><Orders /></DashboardLayout>} />
          <Route path="/orders/create" element={<DashboardLayout><CreateOrder /></DashboardLayout>} />
          <Route path="/orders/edit/:orderId" element={<DashboardLayout><CreateOrder /></DashboardLayout>} />
          <Route path="/orders/:orderId" element={<DashboardLayout><OrderDetail /></DashboardLayout>} />
          <Route path="/invoices" element={<DashboardLayout><Invoices /></DashboardLayout>} />
          <Route path="/invoices/:invoiceId" element={<DashboardLayout><InvoiceDetail /></DashboardLayout>} />
          <Route path="/artwork" element={<DashboardLayout><Artwork /></DashboardLayout>} />
          <Route path="/artwork/rejected" element={<DashboardLayout><RejectedArchive /></DashboardLayout>} />
          <Route path="/pull-ship" element={<DashboardLayout><PullShip /></DashboardLayout>} />
          <Route path="/pull-ship/:orderId" element={<DashboardLayout><PullShipOrderDetail /></DashboardLayout>} />
          <Route path="/my-pos" element={<DashboardLayout><MyPOs /></DashboardLayout>} />
          <Route path="/vendors" element={<DashboardLayout><Vendors /></DashboardLayout>} />
          <Route path="/vendor-pos" element={<DashboardLayout><VendorPOs /></DashboardLayout>} />
          <Route path="/vendor-pos/:poId" element={<DashboardLayout><VendorPODetail /></DashboardLayout>} />
          <Route path="/production" element={<DashboardLayout><Production /></DashboardLayout>} />
          <Route path="/production/:orderId" element={<DashboardLayout><ProductionDetail /></DashboardLayout>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
