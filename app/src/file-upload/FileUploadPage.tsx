import { useEffect } from "react";
import { useNavigate } from "react-router";

/** OpenSaaS S3 demo removed from product nav — redirect to settings. */
export default function FileUploadPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/settings", { replace: true });
  }, [navigate]);
  return (
    <div className="text-muted-foreground p-8 text-sm">
      Use invoice/ticket/expense attachments instead of the S3 demo.
    </div>
  );
}
