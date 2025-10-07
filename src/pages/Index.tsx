import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">Welcome to MFUSED Portal</h1>
        <p className="text-xl text-muted-foreground">Manage your packaging and orders</p>
        <div className="flex gap-4 justify-center">
          <Button onClick={() => navigate('/upload-po')} size="lg">
            Get Started
          </Button>
          <Button onClick={() => navigate('/login')} variant="outline" size="lg">
            Login
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
