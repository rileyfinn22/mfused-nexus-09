import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./components/ThemeProvider";
import { CompanyProvider } from "./contexts/CompanyContext";
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
import DeletedInvoices from "./pages/DeletedInvoices";
import Artwork from "./pages/Artwork";
import RejectedArchive from "./pages/RejectedArchive";
import PullShip from "./pages/PullShip";
import PullShipOrderDetail from "./pages/PullShipOrderDetail";
import PullShipOrders from "./pages/PullShipOrders";
import MyPOs from "./pages/MyPOs";
import Vendors from "./pages/Vendors";
import VendorPOs from "./pages/VendorPOs";
import VendorPODetail from "./pages/VendorPODetail";
import Production from "./pages/Production";
import ProductionDetail from "./pages/ProductionDetail";
import Login from "./pages/Login";
import VendorSignup from "./pages/VendorSignup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";

import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Quotes from "./pages/Quotes";
import QuoteDetail from "./pages/QuoteDetail";
import CreateQuote from "./pages/CreateQuote";
import NotFound from "./pages/NotFound";
import ShipmentUpdate from "./pages/ShipmentUpdate";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider>
        <CompanyProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
          <Route path="/shipment-update" element={<ShipmentUpdate />} />
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
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
          <Route path="/invoices/deleted" element={<DashboardLayout><DeletedInvoices /></DashboardLayout>} />
          <Route path="/invoices/:invoiceId" element={<DashboardLayout><InvoiceDetail /></DashboardLayout>} />
          <Route path="/artwork" element={<DashboardLayout><Artwork /></DashboardLayout>} />
          <Route path="/artwork/rejected" element={<DashboardLayout><RejectedArchive /></DashboardLayout>} />
          <Route path="/pull-ship" element={<DashboardLayout><PullShip /></DashboardLayout>} />
          <Route path="/pull-ship-orders" element={<DashboardLayout><PullShipOrders /></DashboardLayout>} />
          <Route path="/pull-ship-orders/:orderId" element={<DashboardLayout><PullShipOrderDetail /></DashboardLayout>} />
          <Route path="/my-pos" element={<DashboardLayout><MyPOs /></DashboardLayout>} />
          <Route path="/vendors" element={<DashboardLayout><Vendors /></DashboardLayout>} />
          <Route path="/vendor-pos" element={<DashboardLayout><VendorPOs /></DashboardLayout>} />
          <Route path="/vendor-pos/:poId" element={<DashboardLayout><VendorPODetail /></DashboardLayout>} />
          <Route path="/production" element={<DashboardLayout><Production /></DashboardLayout>} />
          <Route path="/production/:orderId" element={<DashboardLayout><ProductionDetail /></DashboardLayout>} />
          <Route path="/settings" element={<DashboardLayout><Settings /></DashboardLayout>} />
          <Route path="/reports" element={<DashboardLayout><Reports /></DashboardLayout>} />
          <Route path="/projects" element={<DashboardLayout><Projects /></DashboardLayout>} />
          <Route path="/projects/:projectId" element={<DashboardLayout><ProjectDetail /></DashboardLayout>} />
          
          <Route path="/customers" element={<DashboardLayout><Customers /></DashboardLayout>} />
          <Route path="/customers/:customerId" element={<DashboardLayout><CustomerDetail /></DashboardLayout>} />
          <Route path="/quotes" element={<DashboardLayout><Quotes /></DashboardLayout>} />
          <Route path="/quotes/create" element={<DashboardLayout><CreateQuote /></DashboardLayout>} />
          <Route path="/quotes/edit/:quoteId" element={<DashboardLayout><CreateQuote /></DashboardLayout>} />
          <Route path="/quotes/respond/:parentQuoteId" element={<DashboardLayout><CreateQuote /></DashboardLayout>} />
          <Route path="/quotes/:quoteId" element={<DashboardLayout><QuoteDetail /></DashboardLayout>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </CompanyProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
