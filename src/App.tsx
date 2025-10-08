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
import Artwork from "./pages/Artwork";
import PullShip from "./pages/PullShip";
import UploadPO from "./pages/UploadPO";
import MyPOs from "./pages/MyPOs";
import POApproval from "./pages/POApproval";
import Login from "./pages/Login";
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
          <Route path="/dashboard" element={<DashboardLayout><Dashboard /></DashboardLayout>} />
          <Route path="/products" element={<DashboardLayout><Products /></DashboardLayout>} />
          <Route path="/products/edit/:id" element={<DashboardLayout><EditProduct /></DashboardLayout>} />
          <Route path="/inventory" element={<DashboardLayout><Inventory /></DashboardLayout>} />
          <Route path="/orders" element={<DashboardLayout><Orders /></DashboardLayout>} />
          <Route path="/orders/create" element={<DashboardLayout><CreateOrder /></DashboardLayout>} />
          <Route path="/orders/edit/:orderId" element={<DashboardLayout><CreateOrder /></DashboardLayout>} />
          <Route path="/orders/:orderId" element={<DashboardLayout><OrderDetail /></DashboardLayout>} />
          <Route path="/invoices" element={<DashboardLayout><Invoices /></DashboardLayout>} />
          <Route path="/artwork" element={<DashboardLayout><Artwork /></DashboardLayout>} />
          <Route path="/pull-ship" element={<DashboardLayout><PullShip /></DashboardLayout>} />
          <Route path="/upload-po" element={<DashboardLayout><UploadPO /></DashboardLayout>} />
          <Route path="/my-pos" element={<DashboardLayout><MyPOs /></DashboardLayout>} />
          <Route path="/po-approval" element={<DashboardLayout><POApproval /></DashboardLayout>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
