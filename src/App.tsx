import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
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
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const Products = lazyWithRetry(() => import("./pages/Products"));
const EditProduct = lazyWithRetry(() => import("./pages/EditProduct"));
const Inventory = lazyWithRetry(() => import("./pages/Inventory"));
const Orders = lazyWithRetry(() => import("./pages/Orders"));
const OrderDetail = lazyWithRetry(() => import("./pages/OrderDetail"));
const CreateOrder = lazyWithRetry(() => import("./pages/CreateOrder"));
const Invoices = lazyWithRetry(() => import("./pages/Invoices"));
const InvoiceDetail = lazyWithRetry(() => import("./pages/InvoiceDetail"));
const InvoiceShippedEdit = lazyWithRetry(() => import("./pages/InvoiceShippedEdit"));
const DeletedInvoices = lazyWithRetry(() => import("./pages/DeletedInvoices"));
const Artwork = lazyWithRetry(() => import("./pages/Artwork"));
const RejectedArchive = lazyWithRetry(() => import("./pages/RejectedArchive"));
const PullShip = lazyWithRetry(() => import("./pages/PullShip"));
const PullShipOrderDetail = lazyWithRetry(() => import("./pages/PullShipOrderDetail"));
const PullShipOrders = lazyWithRetry(() => import("./pages/PullShipOrders"));
const MyPOs = lazyWithRetry(() => import("./pages/MyPOs"));
const Vendors = lazyWithRetry(() => import("./pages/Vendors"));
const VendorPOs = lazyWithRetry(() => import("./pages/VendorPOs"));
const VendorPODetail = lazyWithRetry(() => import("./pages/VendorPODetail"));
const VendorPortal = lazyWithRetry(() => import("./pages/VendorPortal"));
const VendorPortalPODetail = lazyWithRetry(() => import("./pages/VendorPortalPODetail"));
const VendorStatus = lazyWithRetry(() => import("./pages/VendorStatus"));
const Production = lazyWithRetry(() => import("./pages/Production"));
const ProductionDetail = lazyWithRetry(() => import("./pages/ProductionDetail"));
const CustomerProductionPODetail = lazyWithRetry(() => import("./pages/CustomerProductionPODetail"));
const VendorSignup = lazyWithRetry(() => import("./pages/VendorSignup"));
const ForgotPassword = lazyWithRetry(() => import("./pages/ForgotPassword"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const AcceptInvite = lazyWithRetry(() => import("./pages/AcceptInvite"));
const ArtworkReconcile = lazyWithRetry(() => import("./pages/ArtworkReconcile"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));
const Reports = lazyWithRetry(() => import("./pages/Reports"));
const Projects = lazyWithRetry(() => import("./pages/Projects"));
const ProjectDetail = lazyWithRetry(() => import("./pages/ProjectDetail"));
const Customers = lazyWithRetry(() => import("./pages/Customers"));
const CustomerDetail = lazyWithRetry(() => import("./pages/CustomerDetail"));
const Quotes = lazyWithRetry(() => import("./pages/Quotes"));
const QuoteDetail = lazyWithRetry(() => import("./pages/QuoteDetail"));
const CreateQuote = lazyWithRetry(() => import("./pages/CreateQuote"));
const ShipmentUpdate = lazyWithRetry(() => import("./pages/ShipmentUpdate"));
const Chat = lazyWithRetry(() => import("./pages/Chat"));
const Financing = lazyWithRetry(() => import("./pages/Financing"));
const FinanceView = lazyWithRetry(() => import("./pages/FinanceView"));
const FinancedInvoiceDetail = lazyWithRetry(() => import("./pages/FinancedInvoiceDetail"));
const Demo = lazyWithRetry(() => import("./pages/Demo"));
const ForwarderOrders = lazyWithRetry(() => import("./pages/ForwarderOrders"));
const ForwarderOrderDetail = lazyWithRetry(() => import("./pages/ForwarderOrderDetail"));

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
