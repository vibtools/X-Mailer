import { connect } from 'cloudflare:sockets';

export default {
  async fetch(request, env, ctx) {
    try {
      const socket = connect({ hostname: 'smtppro.zoho.com', port: 465 });
      const writer = socket.writable.getWriter();
      const reader = socket.readable.getReader();
      
      const timeout = setTimeout(() => {
        socket.close();
      }, 5000);
      
      const { value, done } = await reader.read();
      clearTimeout(timeout);
      
      if (value) {
        return new Response('Connected: ' + new TextDecoder().decode(value));
      }
      return new Response('No data');
    } catch (e) {
      return new Response('Error: ' + e.message, {status: 500});
    }
  }
};
