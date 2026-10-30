"use client";

import { useLocale, useTranslations } from "next-intl";

interface EconomicCalendarWidgetProps {
  height?: number | string;
  importanceFilter?: string; // e.g. "-1,0,1" for all, "0,1" for medium/high
}

export function EconomicCalendarWidget({ height = 500, importanceFilter = "0,1" }: EconomicCalendarWidgetProps) {
  const locale = useLocale();
  const t = useTranslations("EconomicCalendar");

  // Use srcDoc iframe to completely isolate the TradingView widget from React's lifecycle.
  // This prevents the "contentWindow is not available" error caused by the component unmounting
  // while the TradingView script is still executing asynchronously.
  const srcDoc = `
    <!DOCTYPE html>
    <html lang="${locale}">
      <head>
        <meta charset="utf-8" />
        <style>
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background-color: transparent; }
        </style>
      </head>
      <body>
        <div class="tradingview-widget-container" style="height: 100%; width: 100%;">
          <div class="tradingview-widget-container__widget" style="height: 100%; width: 100%;"></div>
          <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-events.js" async>
            {
              "colorTheme": "dark",
              "isTransparent": true,
              "width": "100%",
              "height": "100%",
              "locale": "${locale}",
              "importanceFilter": "${importanceFilter}",
              "currencyFilter": "USD,EUR,GBP,JPY,AUD,CAD,CHF,NZD"
            }
          </script>
        </div>
      </body>
    </html>
  `;

  return (
    <div style={{ height, width: "100%" }}>
      <iframe
        srcDoc={srcDoc}
        style={{ width: "100%", height: "100%", border: "none" }}
        title={t("iframe_title")}
      />
    </div>
  );
}
