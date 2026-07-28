import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import { registerImagePrintHost, unregisterImagePrintHost } from '../services/imagePrintService';

// Hidden, off-screen WebView that renders receipt HTML and snapshots it to an image FILE, so a
// thermal printer can print the exact same layout as the web/Electron bill/KOT. Mount ONCE at
// the app root. It is completely passive until something asks it to capture (i.e. only when the
// image-print flag is on). One job at a time; jobs queue.
//
// Flow per job: load HTML → measure body height (postMessage) → resize the WebView to fit →
// captureRef → resolve a file:// URI. androidLayerType="software" makes view-shot capture the
// WebView reliably on Android. Any failure rejects → caller falls back to ESC/POS text.

const MAX_HEIGHT = 4000;
const CAPTURE_TIMEOUT_MS = 6000;

export default function ImagePrintHost() {
  const webRef = useRef(null);
  const queueRef = useRef([]);
  const jobRef = useRef(null);
  const [job, setJob] = useState(null);        // { html, width, resolve, reject }
  const [height, setHeight] = useState(400);
  const timeoutRef = useRef(null);

  const finish = useCallback((ok, payload) => {
    const j = jobRef.current;
    if (!j) return;
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    jobRef.current = null;
    setJob(null);
    if (ok) j.resolve(payload); else j.reject(payload);
    // start next queued job on the next tick
    setTimeout(pump, 0);
  }, []);

  const pump = useCallback(() => {
    if (jobRef.current || queueRef.current.length === 0) return;
    const next = queueRef.current.shift();
    jobRef.current = next;
    setHeight(400);
    setJob(next);
    // Safety timeout so a stuck render never hangs the caller.
    timeoutRef.current = setTimeout(() => finish(false, new Error('image capture timeout')), CAPTURE_TIMEOUT_MS);
  }, [finish]);

  useEffect(() => {
    const capture = (html, opts = {}) => new Promise((resolve, reject) => {
      const width = Math.max(200, Math.min(1200, Number(opts.width) || 576));
      queueRef.current.push({ html, width, resolve, reject });
      pump();
    });
    registerImagePrintHost(capture);
    return () => { unregisterImagePrintHost(); if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [pump]);

  // WebView reports its content height → resize, then capture on the next paint.
  const onMessage = useCallback((e) => {
    const h = Math.min(MAX_HEIGHT, Math.max(80, Math.ceil(Number(e?.nativeEvent?.data) || 0)));
    if (!h || !jobRef.current) return;
    setHeight(h);
    // Give the layout a moment to apply the new height, then snapshot.
    setTimeout(async () => {
      const j = jobRef.current;
      if (!j) return;
      try {
        const uri = await captureRef(webRef, { format: 'png', quality: 1, result: 'tmpfile', width: j.width, height: h });
        finish(true, uri.startsWith('file') ? (uri.startsWith('file://') ? uri : `file://${uri}`) : `file://${uri}`);
      } catch (err) {
        finish(false, err);
      }
    }, 300);
  }, [finish]);

  const wrappedHtml = job
    ? `<!DOCTYPE html><html><head><meta name="viewport" content="width=${job.width}, initial-scale=1">` +
      `<style>*{box-sizing:border-box;-webkit-print-color-adjust:exact;} html,body{margin:0;padding:0;background:#fff;width:${job.width}px;}</style></head>` +
      `<body>${job.html}</body></html>`
    : '<html><body></body></html>';

  // Measure after load; posted back via onMessage.
  const injected = 'setTimeout(function(){try{window.ReactNativeWebView.postMessage(String(document.body.scrollHeight||document.documentElement.scrollHeight||400));}catch(e){}},150); true;';

  if (!job) return null;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -100000, top: 0, width: job.width, height, opacity: 0 }}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html: wrappedHtml }}
        injectedJavaScript={injected}
        onMessage={onMessage}
        androidLayerType="software"
        scrollEnabled={false}
        javaScriptEnabled
        style={{ width: job.width, height, backgroundColor: '#fff' }}
      />
    </View>
  );
}
