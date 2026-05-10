import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col">
      <Navbar forceSolid />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center animate-in fade-in zoom-in duration-500">
          <h1 className="text-9xl font-black text-primary/20 mb-4 tracking-tighter">404</h1>
          <h2 className="text-4xl font-bold mb-4">Lost in the kitchen?</h2>
          <p className="text-gray-400 text-lg mb-8 max-w-md mx-auto">
            We couldn't find the page you're looking for. It might have been moved or eaten.
          </p>
          <Button 
            onClick={() => navigate("/")}
            className="bg-white text-black hover:bg-white/90 px-8 py-6 text-lg font-bold"
          >
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
