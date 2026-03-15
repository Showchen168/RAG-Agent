"use client";

import {
  useRef,
  useCallback,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Loader2 } from "lucide-react";

interface DiagramEditorProps {
  initialXml?: string;
  onSave?: (xml: string) => void;
  onExport?: (data: string, format: string) => void;
  onReady?: () => void;
  darkMode?: boolean;
}

export interface DiagramEditorHandle {
  loadXml: (xml: string) => void;
}

const DRAWIO_ORIGIN = "https://embed.diagrams.net";

function buildIframeSrc(darkMode: boolean): string {
  const params = new URLSearchParams({
    embed: "1",
    ui: darkMode ? "dark" : "kennedy",
    spin: "1",
    proto: "json",
    lang: "zh-tw",
    noExitBtn: "1",
    saveAndExit: "0",
    noSaveBtn: "1",
    configure: "1",
  });
  return `${DRAWIO_ORIGIN}/?${params.toString()}`;
}

const DEFAULT_XML =
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';

export const DiagramEditor = forwardRef<
  DiagramEditorHandle,
  DiagramEditorProps
>(function DiagramEditor(
  { initialXml, onSave, onExport, onReady, darkMode = false },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const initialXmlRef = useRef(initialXml);

  useEffect(() => {
    initialXmlRef.current = initialXml;
  }, [initialXml]);

  const sendToIframe = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify(msg),
      DRAWIO_ORIGIN,
    );
  }, []);

  // 暴露 loadXml 方法供外部呼叫（AI Panel 載入新 XML）
  useImperativeHandle(
    ref,
    () => ({
      loadXml(xml: string) {
        sendToIframe({ action: "load", xml, autosave: 1 });
      },
    }),
    [sendToIframe],
  );

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== DRAWIO_ORIGIN) return;
      let data: Record<string, unknown>;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }

      switch (data.event) {
        case "init":
          setLoading(false);
          sendToIframe({
            action: "load",
            xml: initialXmlRef.current || DEFAULT_XML,
            autosave: 1,
          });
          onReady?.();
          break;
        case "save":
        case "autosave":
          onSave?.(data.xml as string);
          break;
        case "export":
          onExport?.(data.data as string, data.format as string);
          break;
        case "configure":
          sendToIframe({
            action: "configure",
            config: { defaultFonts: ["Noto Sans TC"] },
          });
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [sendToIframe, onSave, onExport, onReady]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-10">
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>載入 draw.io 編輯器...</span>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="draw.io"
        src={buildIframeSrc(darkMode)}
        className="absolute inset-0 w-full h-full border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
});
