/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 * 
 * This script is used to intercept fetch requests to Google Cloud AI APIs and 
 * proxy them to the local Node JS server backend server.
 */
(function() {
  const BACKEND_ORIGIN =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_BACKEND_ORIGIN
      ? String(import.meta.env.VITE_BACKEND_ORIGIN).replace(/\/$/, '')
      : '';

  /** 须与 Node 后端环境变量 PROXY_HEADER 完全一致；生产请在 Vercel 设置 VITE_PROXY_HEADER */
  const PROXY_HEADER_VALUE =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_PROXY_HEADER
      ? String(import.meta.env.VITE_PROXY_HEADER)
      : 'Ea4-HmKSQpKIWcUwr400DRi9oZ2yr7Cy';

  function apiProxyHref() {
    return `${BACKEND_ORIGIN}/api-proxy`;
  }

  function wsProxyBaseHref() {
    if (BACKEND_ORIGIN) {
      try {
        const u = new URL(BACKEND_ORIGIN);
        return (u.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + u.host;
      } catch (_e) {
        return '';
      }
    }
    if (typeof location === 'undefined') return '';
    return (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host;
  }

  const originalFetch = window.fetch;
  const originalWebSocket = window.WebSocket;

  // Function to validate VertexGenAi endpoints
  function isValidUrl(url) {
    try {
      const HOST_NAME = 'aiplatform.googleapis.com';
      const MODEL_METHODS = ['generateContent', 'predict', 'streamGenerateContent'];
      const AGENT_METHODS = ['query', 'streamQuery'];
      const isSafePathSegment = (val) => val && encodeURIComponent(val) === val;

      const urlObj = new URL(url);
      if (!urlObj.hostname.endsWith(HOST_NAME)) {
        return false;
      }

      const pathSegments = urlObj.pathname.split('/');
      // Publisher models
      // Expected structure: ['', '{version}', 'publishers', 'google', 'models', '{model}:{method}']
      if (pathSegments.length === 6 &&
        pathSegments[0] === '' &&
        pathSegments[2] === 'publishers' &&
        pathSegments[3] === 'google' &&
        pathSegments[4] === 'models' && urlObj.hostname === HOST_NAME) {
          if (!isSafePathSegment(pathSegments[1])) {
            return false;
          }
          const modelAndMethod = pathSegments[5].split(':');
          return modelAndMethod.length === 2 && isSafePathSegment(modelAndMethod[0]) && MODEL_METHODS.includes(modelAndMethod[1]);
      }

      // Reasoning Engines
      // Expected structrue: ['', '{version}', 'projects', 'locations', 'reasoningEngines', '{id}:{method}']
      if (pathSegments.length === 8 &&
        pathSegments[0] === '' &&
        pathSegments[2] === 'projects' &&
        pathSegments[4] === 'locations' &&
        pathSegments[6] === 'reasoningEngines' && urlObj.hostname.endsWith(`-${HOST_NAME}`)) {
          if (!isSafePathSegment(pathSegments[1]) || !isSafePathSegment(pathSegments[3]) || !isSafePathSegment(pathSegments[5])) {
            return false;
          }
          const idAndMethod = pathSegments[7].split(':');
          return idAndMethod.length === 2 && isSafePathSegment(idAndMethod[0]) && AGENT_METHODS.includes(idAndMethod[1]);
      }

      
      // Live API (WebSocket)
      if (url === 'wss://aiplatform.googleapis.com//ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent') {
        return true;
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  console.log('[Vertex AI Proxy Shim] Initialized. Intercepting for Cloud AI API URLs');

  
  window.WebSocket = function(url, protocols) {
    const inputUrl = typeof url === 'string' ? url : (url instanceof URL ? url.href : null);

    if (inputUrl && isValidUrl(inputUrl)) {
      
      console.log('[Vertex AI Proxy Shim] Intercepted Vertex WebSocket request:', inputUrl);
      const targetUrl = encodeURIComponent(inputUrl);
      const base = wsProxyBaseHref();
      const proxyUrl = `${base}/ws-proxy?target=${targetUrl}`;
      return new originalWebSocket(proxyUrl, protocols);
    }
    return new originalWebSocket(url, protocols);
  };

  // Copy propertires to ensure compatibility
  window.WebSocket.prototype = originalWebSocket.prototype;
  window.WebSocket.CONNECTING = originalWebSocket.CONNECTING;
  window.WebSocket.OPEN = originalWebSocket.OPEN;
  window.WebSocket.CLOSING = originalWebSocket.CLOSING;
  window.WebSocket.CLOSED = originalWebSocket.CLOSED;

  window.fetch = async function(url, options) {

    const inputUrl = typeof url === 'string' ? url : (url instanceof Request ? url.url : null);
    const normalizedUrl = (typeof inputUrl === 'string') ? inputUrl.split('?')[0] : null;

    // 同源 Vite 代理 / 本地后端：与 Vertex 无关，直接走原生 fetch（避免报错栈顶指向本文件、也避免多余包装）
    if (normalizedUrl && typeof location !== 'undefined') {
      try {
        const u = new URL(normalizedUrl, location.href);
        const onSamePage = u.origin === location.origin;
        let onBackend = false;
        if (BACKEND_ORIGIN) {
          try {
            onBackend = u.origin === new URL(BACKEND_ORIGIN).origin;
          } catch (_e) {
            onBackend = false;
          }
        }
        if (onSamePage || onBackend) {
          const p = u.pathname;
          if (
            p.startsWith('/vectorengine-api') ||
            p.startsWith('/cdn-files-toapis') ||
            p.startsWith('/cdn-files-dashlyai') ||
            p.startsWith('/api-proxy') ||
            p.startsWith('/ws-proxy') ||
            p.startsWith('/yunzhi-openai') ||
            p.startsWith('/api/yunzhi-proxy')
          ) {
            return originalFetch(url, options);
          }
        }
      } catch (_e) {
        /* ignore */
      }
    }

    // Check if the URL matches the patterns of Vertex AI APIs.
    if (normalizedUrl && isValidUrl(normalizedUrl)) {
      console.log('[Vertex AI Proxy Shim] Intercepted Vertex API request:', normalizedUrl);
      // Prepare the request details to send to the local Node.js backend.
      const requestDetails = {
        originalUrl: normalizedUrl,
        headers: options?.headers ? Object.fromEntries(new Headers(options.headers).entries()) : {},
        method: options?.method || 'POST',
        // Serialize headers from Headers object or plain object (these should include request auth headers.
        // Pass the body as is. The Node backend will handle parsing.
        body: options?.body,
      };

      try {
        // Make a fetch request to the local Node JS proxy endpoint.
        const proxyFetchOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Add a random header to identify these proxied requests on the Node.js backend.
            'X-App-Proxy': PROXY_HEADER_VALUE,
          },
          body: JSON.stringify(requestDetails),
        };

        console.log('[Vertex AI Proxy Shim] Fetching from Node backend:', apiProxyHref());
        // 必须用 originalFetch：此处若写 fetch，打包后可能指向尚未完成的局部绑定（TDZ: Cannot access before initialization），且会误走当前 shim。
        const proxyResponse = await originalFetch(apiProxyHref(), proxyFetchOptions);

        if (proxyResponse.status === 401) {
            console.error('[Vertex Proxy Shim] Local Node.js backend returned 401. Authentication may be needed.');
            return proxyResponse; // Return the proxy's 401 response.
        }


        if (!proxyResponse.ok) {
          console.error(`[Vertex Proxy Shim] Proxy request to /api-proxy failed with status ${proxyResponse.status}: ${proxyResponse.statusText}`);
          return proxyResponse; // Propagate other non-ok responses from the proxy.
        }

        return proxyResponse;
      } catch (error) {
        console.error('[Vertex AI Proxy Shim] Error fetching from local Node.js backend:', error);
        return new Response(JSON.stringify({
            error: 'Proxying failed',
            details: error.message, name: error.name,
            proxiedUrl: inputUrl
          }),
          {
            status: 503, // Service Unavailable
            statusText: 'Local Proxy Unavailable',
            headers: { 'Content-Type': 'text/plain' },
          }
        );
      }
    } else {
      // If the URL doesn't match the Vertex API regex, use the original window.fetch.
      return originalFetch(url, options);
    }
  }
})()