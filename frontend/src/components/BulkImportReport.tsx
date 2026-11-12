"use client";

import { useEffect, useRef } from "react";
import { Download } from "lucide-react";

/** Success (or error) summary shown immediately above the bulk-import button. */
export default function BulkImportReport({
  message,
  tone = "success",
  result,
  onDownloadCredentials,
}: {
  message?: string | null;
  tone?: "success" | "error" | "brand" | string;
  result?: any | null;
  onDownloadCredentials?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message || result) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [message, result]);

  if (!message && !result) return null;

  const rows: any[] = Array.isArray(result?.results) ? result.results : [];
  const messageTone =
    tone === "error"
      ? "bg-rose-50 text-rose-700"
      : tone === "brand"
        ? "bg-amber-50 text-amber-900"
        : "bg-emerald-50 text-emerald-800";

  return (
    <div ref={ref} className="space-y-2" data-testid="bulk-import-report">
      {message && <div className={`rounded-xl p-3 text-sm ${messageTone}`}>{message}</div>}
      {result && (
        <div className="surface space-y-2 p-4">
          <b className="text-sm">
            Last import · {result.createdCount ?? 0} created · {result.errorCount ?? 0} errors
          </b>
          <div className="max-h-48 space-y-1 overflow-auto">
            {rows.map((r: any, i: number) => (
              <p key={`${r.row ?? i}-${r.email || i}`} className="text-xs text-slate-700">
                <span className={r.success ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
                  Row {r.row ?? i + 1}: {r.success ? "Created" : "Error"}
                </span>
                {r.fullName ? ` · ${r.fullName}` : ""}
                {r.email ? ` · ${r.email}` : ""}
                {r.agency ? ` · ${r.agency}` : ""}
                {r.role ? ` · ${r.role}` : ""}
                {r.phone ? ` · ${r.phone}` : ""}
                {r.portfolio ? ` · ${r.portfolio}` : ""}
                {r.error ? ` · ${r.error}` : ""}
                {r.success && (
                  <span
                    className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      r.emailSent ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                    }`}
                    title={r.mailError || ""}
                  >
                    {r.emailSent ? "Email sent" : "Email not sent"}
                  </span>
                )}
              </p>
            ))}
            {!rows.length && <p className="text-xs text-slate-500">No row details were returned.</p>}
          </div>
          {result.credentialsCsv && onDownloadCredentials && (
            <button type="button" onClick={onDownloadCredentials} className="btn-success w-full">
              <Download size={16} /> Download credentials CSV ({result.createdCount})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
