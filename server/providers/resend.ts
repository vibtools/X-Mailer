/**
 * Resend REST API Provider Adapter
 */

import { EmailChannel, EmailPayload, SendResult, VerifyResult } from "./types";

export async function sendWithResend(
  channel: EmailChannel,
  payload: EmailPayload
): Promise<SendResult> {
  const apiKey = channel.key?.trim();
  if (!apiKey) {
    return {
      success: false,
      provider: "resend",
      error: "Missing Resend API Key for channel: " + channel.name,
    };
  }

  // Anti-Phishing Guard: Default tracking to false to prevent resend.com/c/ redirects and spam penalties
  const openTracking = payload.open_tracking !== undefined
    ? Boolean(payload.open_tracking)
    : (payload.track_opens !== undefined ? Boolean(payload.track_opens) : false);

  const clickTracking = payload.click_tracking !== undefined
    ? Boolean(payload.click_tracking)
    : (payload.track_clicks !== undefined ? Boolean(payload.track_clicks) : false);

  const resendPayload: Record<string, any> = {
    from: payload.from,
    to: [payload.to],
    subject: payload.subject,
    html: payload.html || "",
    text: payload.text || undefined,
    open_tracking: openTracking,
    click_tracking: clickTracking,
  };

  if (payload.headers && Object.keys(payload.headers).length > 0) {
    resendPayload.headers = payload.headers;
  }

  if (payload.reply_to) {
    resendPayload.reply_to = payload.reply_to;
  }

  if (payload.attachments && payload.attachments.length > 0) {
    resendPayload.attachments = payload.attachments.map((att) => ({
      filename: att.filename,
      content: att.content,
      path: att.path,
    }));
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });

    const resendData: any = await response.json().catch(() => ({}));

    if (response.ok && resendData.id) {
      return {
        success: true,
        messageId: resendData.id,
        provider: "resend",
        details: resendData,
      };
    }

    return {
      success: false,
      provider: "resend",
      error: resendData.message || `Resend error (${response.status})`,
      code: resendData.name || `HTTP_${response.status}`,
      details: resendData,
    };
  } catch (err: any) {
    return {
      success: false,
      provider: "resend",
      error: err.message || "Failed to reach Resend API endpoint",
    };
  }
}

export async function verifyResend(channel: EmailChannel): Promise<VerifyResult> {
  const apiKey = channel.key?.trim();
  if (!apiKey) {
    return {
      success: false,
      message: "Resend API Key is required",
      error: "Missing API Key",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/api-keys", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      return {
        success: true,
        message: "Resend API connection authenticated successfully",
      };
    }

    const data: any = await res.json().catch(() => ({}));
    return {
      success: false,
      message: data.message || `Resend API rejected credentials (status ${res.status})`,
      error: data.name || "AUTH_FAILED",
      details: data,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to connect to Resend API: ${err.message}`,
      error: err.message,
    };
  }
}
