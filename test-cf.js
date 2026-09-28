import nodemailer from 'nodemailer';

export default {
  async fetch(request, env, ctx) {
    const transporter = nodemailer.createTransport({
      host: 'smtppro.zoho.com',
      port: 465,
      secure: true,
      auth: {
        user: 'alexharrisreal49@zohomail.com',
        pass: 'V067Nuk2dDnW'
      },
      connectionTimeout: 10000
    });
    try {
      await transporter.verify();
      return new Response('OK');
    } catch (e) {
      return new Response(e.message + ' ' + e.code, {status: 500});
    }
  }
};
