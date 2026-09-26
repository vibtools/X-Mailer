/**
 * Unified Email Dispatcher & Provider Manager
 */

import { sendWithResend, verifyResend } from "./resend";
import {
  sendWithSmtp,
  verifySmtp,
  invalidateTransporter,
} from "./smtp";
import { EmailChannel, EmailPayload, SendResult, VerifyResult } from "./types";

export * from "./types";
export * from "./resend";
export * from "./smtp";

/**
 * Unified Dispatcher: Dispatches email through the appropriate provider adapter.
 */
export async function sendEmailUnified(
  channel: EmailChannel,
  payload: EmailPayload
): Promise<SendResult> {
  const provider = channel.provider_type || (channel.smtp_host ? "smtp" : "resend");

  if (provider === "smtp") {
    return sendWithSmtp(channel, payload);
  }

  return sendWithResend(channel, payload);
}

/**
 * Unified Verification: Validates channel credentials and connection health.
 */
export async function verifyChannel(channel: EmailChannel): Promise<VerifyResult> {
  const provider = channel.provider_type || (channel.smtp_host ? "smtp" : "resend");

  if (provider === "smtp") {
    return verifySmtp(channel);
  }

  return verifyResend(channel);
}

/**
 * Evict any cached sockets or connections when a channel is modified or deleted.
 */
export function evictChannel(channelId: string): void {
  invalidateTransporter(channelId);
}
