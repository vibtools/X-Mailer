// Cloudflare Pages Functions Middleware
// Handles global CORS, preflight OPTIONS requests, and security headers

interface Env {
  DATABASE_URL?: string;
  NEON_DATABASE_URL?: string;
  RESEND_API_KEY?: string;
  NODE_ENV?: string;
}

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    },
  });
};

export const onRequest = async (context: { next: () => Promise<Response>; env: Env; request: Request }) => {
  try {
    const response = await context.next();
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (err: any) {
    const url = new URL(context.request.url);
    if (url.pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({
          error: err?.message || 'Edge Worker exception occurred',
          success: false,
          status: 500,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
    throw err;
  }
};

