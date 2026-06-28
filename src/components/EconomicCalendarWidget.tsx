"use client";

import { useEffect, useRef } from "react";

interface EconomicCalendarWidgetProps {
  height?: number | string;
  importanceFilter?: string; // e.g. "-1,0,1" for all, "0,1" for medium/high
}

export function EconomicCalendarWidget({ height = 500, importanceFilter = "0,1" }: EconomicCalendarWidgetProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    
    // Clear the container in case of React StrictMode double-render
    container.current.innerHTML = "";
    
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = `
      {
        "colorTheme": "dark",
        "isTransparent": true,
        "width": "100%",
        "height": "100%",
        "locale": "en",
        "importanceFilter": "${importanceFilter}",
        "currencyFilter": "USD,EUR,GBP,JPY,AUD,CAD,CHF,NZD"
      }
    `;
    container.current.appendChild(script);
  }, [importanceFilter]);

  return (
    <div className="tradingview-widget-container" style={{ height }}>
      <div className="tradingview-widget-container__widget" ref={container} style={{ height: "100%", width: "100%" }}></div>
    </div>
  );
}
