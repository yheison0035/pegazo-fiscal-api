import { Injectable } from '@nestjs/common';

// Envío de correo vía Resend (REST, sin dependencias). Best-effort: si no está
// configurado (RESEND_API_KEY) o falla, NO bloquea la operación.
@Injectable()
export class MailerService {
  async send(to: string, subject: string, html: string): Promise<void> {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM || 'Pegazo <no-reply@pegazo.co>';
    if (!key || !to) return;
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html }),
      });
    } catch {
      /* no interrumpe la emisión */
    }
  }
}
