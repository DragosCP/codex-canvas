import { useEffect, useState } from "react";
import { AppServerClient } from "../appServerClient";
import type { InspectorSelection } from "../types";
import { decodeBase64 } from "../utils/format";

export function useDocumentPreview(
  client: AppServerClient,
  inspector: InspectorSelection,
) {
  const [documentText, setDocumentText] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  useEffect(() => {
    if (inspector.type !== "document") return;
    let cancelled = false;
    setDocumentText(null);
    setDocumentError(null);
    client
      .request<{ dataBase64: string }>("fs/readFile", { path: inspector.path })
      .then((response) => {
        if (!cancelled) setDocumentText(decodeBase64(response.dataBase64));
      })
      .catch((error) => {
        if (!cancelled) setDocumentError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [client, inspector]);

  return { documentText, documentError };
}
