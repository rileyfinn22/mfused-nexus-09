import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./components/ThemeProvider";
import { CompanyProvider } from "./contexts/CompanyContext";
import { DashboardLayout } from "./components/DashboardLayout";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// Every page used to be in one 4 MB bundle, together with the PDF, spreadsheet and image
// libraries, so the first load pulled everything. Pages now load on demand; the shell,
// the landing page and login stay in the main chunk.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const EditProduct = lazy(() => import("./pages/EditProduct"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const CreateOrder = lazy(() => import("./pages/CreateOrder"));
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceDetail = lazy(() => import("./pages/InvoiceDetail"));
const InvoiceShippedEdit = lazy(() => import("./pages/InvoiceShippedEdit"));
const DeletedInvoices = lazy(() => import("./pages/DeletedInvoices"));
const Artwork = lazy(() => import("./pages/Artwork"));
const RejectedArchive = lazy(() => import("./pages/RejectedArchive"));
const PullShip = lazy(() => import("./pages/PullShip"));
const PullShipOrderDetail = lazy(() => import("./pages/PullShipOrderDetail"));
const PullShipOrders = lazy(() => import("./pages/PullShipOrders"));
const MyPOs = lazy(() => import("./pages/MyPOs"));
const Vendors = lazy(() => import("./pages/Vendors"));
const VendorPOs = lazy(() => import("./pages/VendorPOs"));
const VendorPODetail = lazy(() => import("./pages/VendorPODetail"));
const VendorPortal = lazy(() => import("./pages/VendorPortal"));
const VendorPortalPODetail = lazy(() => import("./pages/VendorPortalPODetail"));
const VendorStatus = lazy(() => import("./pages/VendorStatus"));
const Production = lazy(() => import("./pages/Production"));
const ProductionDetail = lazy(() => import("./pages/ProductionDetail"));
const CustomerProductionPODetail = lazy(() => import("./pages/CustomerProductionPODetail"));
const VendorSignup = lazy(() => import("./pages/VendorSignup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const ArtworkReconcile = lazy(() => import("./pages/ArtworkReconcile"));
const Settings = lazy(() => import("./pages/Settings"));
const Reports = lazy(() => import("./pages/Reports"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));
const Quotes = lazy(() => import("./pages/Quotes"));
const QuoteDetail = lazy(() => import("./pages/QuoteDetail"));
const CreateQuote = lazy(() => import("./pages/CreateQuote"));
const ShipmentUpdate = lazy(() => import("./pages/ShipmentUpdate"));
const Chat = lazy(() => import("./pages/Chat"));
const Financing = lazy(() => import("./pages/Financing"));
const FinanceView = lazy(() => import("./pages/FinanceView"));
const FinancedInvoiceDetail = lazy(() => import("./pages/FinancedInvoiceDetail"));
const Demo = lazy(() => import("./pages/Demo"));
const ForwarderOrders = lazy(() => import("./pages/ForwarderOrders"));
const ForwarderOrderDetail = lazy(() => import("./pages/ForwarderOrderDetail"));

/** Thin progress line while a page chunk loads; the layout stays put. */
const RouteFallback = () => (
  <div className="fixed left-0 right-0 top-0 z-50 h-0.5 overflow-hidden bg-transparent" aria-hidden>
    <div className="h-full w-1/3 animate-pulse bg-foreground/40" />
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <CompanyProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
            <Routes>
          <Route path="/shipment-update" element={<ShipmentUpdate />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/finance-view" element={<FinanceView />} />
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
          <Route path="/invoices/:invoiceId/shipped" element={<DashboardLayout><InvoiceShippedEdit /></DashboardLayout>} />
          <Route path="/artwork" element={<DashboardLayout><Artwork /></DashboardLayout>} />
          <Route path="/artwork/reconcile" element={<DashboardLayout><ArtworkReconcile /></DashboardLayout>} />
          <Route path="/artwork/rejected" element={<DashboardLayout><RejectedArchive /></DashboardLayout>} />
          <Route path="/pull-ship" element={<DashboardLayout><PullShip /></DashboardLayout>} />
          <Route path="/pull-ship-orders" element={<DashboardLayout><PullShipOrders /></DashboardLayout>} />
          <Route path="/pull-ship-orders/:orderId" element={<DashboardLayout><PullShipOrderDetail /></DashboardLayout>} />
          <Route path="/my-pos" element={<DashboardLayout><MyPOs /></DashboardLayout>} />
          <Route path="/vendors" element={<DashboardLayout><Vendors /></DashboardLayout>} />
          <Route path="/vendor-pos" element={<DashboardLayout><VendorPOs /></DashboardLayout>} />
          <Route path="/vendor-pos/:poId" element={<DashboardLayout><VendorPODetail /></DashboardLayout>} />
          <Route path="/vendor-portal" element={<DashboardLayout><VendorPortal /></DashboardLayout>} />
          <Route path="/vendor-portal/:poId" element={<DashboardLayout><VendorPortalPODetail /></DashboardLayout>} />
          <Route path="/vendor-status" element={<DashboardLayout><VendorStatus /></DashboardLayout>} />
          <Route path="/production" element={<DashboardLayout><Production /></DashboardLayout>} />
          <Route path="/production/po/:poId" element={<DashboardLayout><CustomerProductionPODetail /></DashboardLayout>} />
          <Route path="/production/:orderId" element={<DashboardLayout><ProductionDetail /></DashboardLayout>} />
          <Route path="/settings" element={<DashboardLayout><Settings /></DashboardLayout>} />
          <Route path="/reports" element={<DashboardLayout><Reports /></DashboardLayout>} />
           <Route path="/chat" element={<DashboardLayout><Chat /></DashboardLayout>} />
           <Route path="/financing" element={<DashboardLayout><Financing /></DashboardLayout>} />
           <Route path="/financing/:id" element={<DashboardLayout><FinancedInvoiceDetail /></DashboardLayout>} />
          <Route path="/projects" element={<DashboardLayout><Projects /></DashboardLayout>} />
          <Route path="/projects/:projectId" element={<DashboardLayout><ProjectDetail /></DashboardLayout>} />
          
          <Route path="/customers" element={<DashboardLayout><Customers /></DashboardLayout>} />
          <Route path="/customers/:customerId" element={<DashboardLayout><CustomerDetail /></DashboardLayout>} />
          <Route path="/quotes" element={<DashboardLayout><Quotes /></DashboardLayout>} />
          <Route path="/quotes/create" element={<DashboardLayout><CreateQuote /></DashboardLayout>} />
          <Route path="/quotes/edit/:quoteId" element={<DashboardLayout><CreateQuote /></DashboardLayout>} />
          <Route path="/quotes/respond/:parentQuoteId" element={<DashboardLayout><CreateQuote /></DashboardLayout>} />
           <Route path="/quotes/:quoteId" element={<DashboardLayout><QuoteDetail /></DashboardLayout>} />
           <Route path="/forwarder/orders" element={<DashboardLayout><ForwarderOrders /></DashboardLayout>} />
           <Route path="/forwarder/orders/:orderId" element={<DashboardLayout><ForwarderOrderDetail /></DashboardLayout>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </CompanyProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
