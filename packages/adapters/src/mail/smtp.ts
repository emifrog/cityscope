import type { MailMessage, Mailer } from '@etare/application';
import { createTransport, type Transporter } from 'nodemailer';

/**
 * Sends the notifications through an SMTP server (`smtp://` or `smtps://`
 * URL; Mailpit locally). Timeouts are short: a failure is recorded and the
 * job queue retries later, the workflow never waits for the mail server.
 */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = createTransport({
      url,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
