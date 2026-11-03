(() => {
  if (Number(window.__QG_RELATION_NETWORK_V2__?.version || 0) >= 4) return;

  const originalFetch = window.fetch.bind(window);
  // Respect server-provided Retry-After / reset headers when available.
  // Keep only a bounded duration; never expose request auth headers.
  const getRetryAfterMs = (response) => {
    if (Number(response?.status) !== 429) return 0;
    const headers = response.headers;
    let wait = 0;
    try {
      const retryAfter = String(headers?.get('retry-after') || '').trim();
      if (/^\d+(?:\.\d+)?$/.test(retryAfter))
        wait = Math.ceil(Number(retryAfter) * 1000);
      else if (retryAfter) {
        const at = Date.parse(retryAfter);
        if (Number.isFinite(at)) wait = Math.max(0, at - Date.now());
      }
      const reset = Number(headers?.get('x-rate-limit-reset') || 0);
      if (reset > 0) {
        const at = reset > 1e12 ? reset : reset * 1000;
        wait = Math.max(wait, Math.max(0, at - Date.now()));
      }
    } catch {}
    return Math.min(24 * 60 * 60 * 1000, Math.max(0, wait));
  };
  const templates = new Map();
  // Diagnostics contain only request status/error codes, never URLs, cookies or usernames.
  const lastFailures = new Map();
  function recordFailure(relation, status, error) {
    if (!relation) return;
    lastFailures.set(relation, {
      status: Number(status) || 0,
      error: String(error || "").slice(0, 50),
      retryAfterMs: Number(arguments[3] || 0) || 0,
      observedAt: Date.now()
    });
  }
  function clearFailure(relation) {
    if (relation) lastFailures.delete(relation);
  }
  const queues = new Map([
    ["following", []],
    ["followers", []]
  ]);

  const relationFromUrl = (value) => {
    try {
      const url = new URL(typeof value === "string" ? value : value?.url || String(value || ""), location.href);
      const op = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || "");
      if (/^Followers$/i.test(op)) return "followers";
      if (/^Following$/i.test(op)) return "following";
    } catch {}
    return null;
  };

  const getUrl = (input) => {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (input instanceof Request) return input.url;
    return String(input || "");
  };

  const serializeHeaders = (input, init) => {
    const out = {};
    try {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      for (const [key, value] of headers.entries()) out[key] = value;
    } catch {}
    return out;
  };

  const makeTemplate = (input, init) => ({
    url: getUrl(input),
    method: String(init?.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase(),
    headers: serializeHeaders(input, init),
    body: typeof init?.body === "string"
      ? init.body
      : (input instanceof Request && typeof input.body === "string" ? input.body : null),
    credentials: init?.credentials || (input instanceof Request ? input.credentials : "include") || "include",
    mode: init?.mode || (input instanceof Request ? input.mode : "cors") || "cors"
  });

  const readVariables = (template) => {
    if (!template) return {};
    if (template.method === "GET" || !template.body) {
      try {
        const url = new URL(template.url, location.href);
        const raw = url.searchParams.get("variables");
        return raw ? JSON.parse(raw) : {};
      } catch { return {}; }
    }
    try {
      const body = JSON.parse(template.body);
      return body?.variables && typeof body.variables === "object" ? body.variables : body || {};
    } catch { return {}; }
  };

  const withCursor = (template, cursor) => {
    if (!template || !cursor) return null;
    const next = {
      ...template,
      headers: { ...(template.headers || {}) }
    };

    if (next.method === "GET" || !next.body) {
      try {
        const url = new URL(next.url, location.href);
        const variables = readVariables(next);
        variables.cursor = cursor;
        url.searchParams.set("variables", JSON.stringify(variables));
        next.url = url.href;
      } catch { return null; }
    } else {
      try {
        const body = JSON.parse(next.body);
        if (body?.variables && typeof body.variables === "object") body.variables.cursor = cursor;
        else body.cursor = cursor;
        next.body = JSON.stringify(body);
      } catch { return null; }
    }
    return next;
  };

  const normalizeUser = (result) => {
    if (!result || typeof result !== "object") return null;
    if (result.__typename && !/User/i.test(String(result.__typename))) return null;
    const legacy = result.legacy || null;
    const core = result.core || null;
    const username = legacy?.screen_name
      || core?.screen_name
      || result.screen_name
      || "";
    if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) return null;
    const displayName = legacy?.name || core?.name || "";
    const avatar = legacy?.profile_image_url_https
      || legacy?.profile_image_url
      || result.avatar?.image_url
      || "";
    const verified = Boolean(
      result.is_blue_verified
      || legacy?.verified
      || result.verification?.verified
    );
    return { username, displayName, avatar, verified };
  };

  const extractFromEntry = (entry, users, seen) => {
    let bottomCursor = null;

    const walk = (node, depth = 0) => {
      if (!node || depth > 14) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }
      if (typeof node !== "object") return;

      if (node.cursorType === "Bottom" && typeof node.value === "string" && node.value) {
        bottomCursor = node.value;
      }

      const candidates = [
        node.user_results?.result,
        node.userResult?.result,
        node.itemContent?.user_results?.result
      ].filter(Boolean);

      for (const candidate of candidates) {
        const user = normalizeUser(candidate);
        if (!user) continue;
        const key = user.username.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        users.push(user);
      }

      for (const [key, value] of Object.entries(node)) {
        if (key === "legacy" || key === "clientEventInfo") continue;
        walk(value, depth + 1);
      }
    };

    walk(entry);
    return bottomCursor;
  };

  const getGraphQLError = (payload) => {
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    if (!errors.length) return null;
    const first = errors[0] || {};
    const code = Number(first.code);
    const message = String(first.message || first.detail || "GraphQL error").trim();
    if (code === 88 || /rate limit|too many requests/i.test(message)) {
      return { error: "HTTP_429", code, message };
    }
    const safeCode = Number.isFinite(code) ? String(code) : "UNKNOWN";
    return { error: "GRAPHQL_ERROR_" + safeCode, code, message };
  };

  const extractPage = (payload) => {
    const users = [];
    const seen = new Set();
    let bottomCursor = null;
    const instructionSets = [];

    const collectInstructionSets = (node, depth = 0) => {
      if (!node || depth > 12) return;
      if (Array.isArray(node)) {
        for (const item of node) collectInstructionSets(item, depth + 1);
        return;
      }
      if (typeof node !== "object") return;
      if (Array.isArray(node.instructions)) instructionSets.push(node.instructions);
      for (const value of Object.values(node)) collectInstructionSets(value, depth + 1);
    };

    collectInstructionSets(payload);

    const entries = [];
    for (const instructions of instructionSets) {
      for (const instruction of instructions) {
        if (Array.isArray(instruction?.entries)) entries.push(...instruction.entries);
        if (instruction?.entry) entries.push(instruction.entry);
      }
    }

    const sourceEntries = entries.length ? entries : [payload];
    for (const entry of sourceEntries) {
      const cursor = extractFromEntry(entry, users, seen);
      if (cursor) bottomCursor = cursor;
    }

    return { users, bottomCursor };
  };

  const enqueueResponse = async (response, relation, template, source = "page") => {
    try {
      const payload = await response.clone().json();
      const gql = getGraphQLError(payload);
      if (gql) {
        recordFailure(relation, response.status, gql.error);
        return;
      }
      const page = extractPage(payload);
      if (page.users.length || page.bottomCursor) clearFailure(relation);
      if (!page.users.length && !page.bottomCursor) return;
      const variables = readVariables(template);
      const queue = queues.get(relation) || [];
      queue.push({
        users: page.users,
        bottomCursor: page.bottomCursor,
        requestCursor: typeof variables?.cursor === "string" ? variables.cursor : null,
        observedAt: Date.now(),
        source
      });
      while (queue.length > 50) queue.shift();
      queues.set(relation, queue);
    } catch {}
  };

  window.fetch = async function(input, init) {
    const relation = relationFromUrl(input);
    const template = relation ? makeTemplate(input, init) : null;
    if (relation && template) templates.set(relation, template);

    let response;
    try {
      response = await originalFetch(input, init);
    } catch (error) {
      recordFailure(relation, 0, "NETWORK_ERROR");
      throw error;
    }
    if (relation && !response?.ok) {
      recordFailure(relation, response?.status, "HTTP_" + response?.status, getRetryAfterMs(response));
    } else if (relation && response?.ok) {
      void enqueueResponse(response, relation, template, "page");
    }
    return response;
  };

  const XHR = window.XMLHttpRequest;
  if (XHR?.prototype) {
    const originalOpen = XHR.prototype.open;
    const originalSetRequestHeader = XHR.prototype.setRequestHeader;
    const originalSend = XHR.prototype.send;

    XHR.prototype.open = function(method, url, ...rest) {
      this.__qg = {
        method: String(method || "GET").toUpperCase(),
        url: String(url || ""),
        headers: {}
      };
      return originalOpen.call(this, method, url, ...rest);
    };

    XHR.prototype.setRequestHeader = function(name, value) {
      if (this.__qg) this.__qg.headers[String(name).toLowerCase()] = String(value);
      return originalSetRequestHeader.call(this, name, value);
    };

    XHR.prototype.send = function(body) {
      const meta = this.__qg || {};
      const relation = relationFromUrl(meta.url || "");
      const template = relation ? {
        url: meta.url || "",
        method: meta.method || "GET",
        headers: { ...(meta.headers || {}) },
        body: typeof body === "string" ? body : null,
        credentials: "include",
        mode: "cors"
      } : null;

      if (relation && template) templates.set(relation, template);

      if (relation) {
        this.addEventListener("load", () => {
          try {
            if (this.status < 200 || this.status >= 300) {
              recordFailure(relation, this.status, "HTTP_" + this.status, this.status === 429 ? (() => { const seconds = Number(this.getResponseHeader("retry-after") || 0); return Number.isFinite(seconds) && seconds > 0 ? Math.min(86400000, Math.ceil(seconds * 1000)) : 0; })() : 0);
              return;
            }
            let payload = null;
            if (this.responseType === "json") payload = this.response;
            else if (!this.responseType || this.responseType === "text") payload = JSON.parse(this.responseText || "null");
            if (!payload) return;
            const gql = getGraphQLError(payload);
            if (gql) {
              recordFailure(relation, this.status, gql.error);
              return;
            }
            const page = extractPage(payload);
            if (page.users.length || page.bottomCursor) clearFailure(relation);
            if (!page.users.length && !page.bottomCursor) return;
            const variables = readVariables(template);
            const queue = queues.get(relation) || [];
            queue.push({
              users: page.users,
              bottomCursor: page.bottomCursor,
              requestCursor: typeof variables?.cursor === "string" ? variables.cursor : null,
              observedAt: Date.now(),
              source: "xhr"
            });
            while (queue.length > 50) queue.shift();
            queues.set(relation, queue);
          } catch {}
        }, { once: true });
      }

      return originalSend.call(this, body);
    };
  }

  const state = {
    version: 4,

    status(relation) {
      const template = templates.get(relation);
      const queue = queues.get(relation) || [];
      return {
        ok: true,
        templateReady: Boolean(template),
        queueLength: queue.length,
        lastFailure: lastFailures.get(relation) || null,
        requestCursor: template ? (readVariables(template)?.cursor || null) : null
      };
    },

    pull(relation) {
      const queue = queues.get(relation) || [];
      const items = queue.splice(0, queue.length);
      return { ok: true, items };
    },

    async fetchCursorPage(relation, cursor) {
      const template = templates.get(relation);
      if (!template) return { ok: false, error: "TEMPLATE_NOT_READY" };
      const replay = withCursor(template, cursor);
      if (!replay) return { ok: false, error: "CURSOR_REQUEST_BUILD_FAILED" };

      try {
        const response = await originalFetch(replay.url, {
          method: replay.method,
          headers: replay.headers,
          body: replay.method === "GET" || replay.method === "HEAD" ? undefined : replay.body,
          credentials: replay.credentials || "include",
          mode: replay.mode || "cors",
          cache: "no-store"
        });
        if (!response.ok) {
          recordFailure(relation, response.status, "HTTP_" + response.status);
          return { ok: false, status: response.status, error: "HTTP_" + response.status,
            retryAfterMs: getRetryAfterMs(response) };
        }
        const payload = await response.json();
        const graphQLError = getGraphQLError(payload);
        if (graphQLError) {
          recordFailure(relation, response.status, graphQLError.error);
          return {
            ok: false,
            status: response.status,
            error: graphQLError.error,
            graphQLErrorCode: graphQLError.code,
            graphQLErrorMessage: graphQLError.message
          };
        }
        const page = extractPage(payload);
        if (page.users.length || page.bottomCursor) clearFailure(relation);
        return {
          ok: true,
          status: response.status,
          users: page.users,
          bottomCursor: page.bottomCursor || null
        };
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      }
    }
  };

  Object.defineProperty(window, "__QG_RELATION_NETWORK_V2__", {
    value: state,
    configurable: true,
    enumerable: false,
    writable: false
  });
})();