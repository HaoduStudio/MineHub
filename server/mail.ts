import nodemailer from "nodemailer"
import { env } from "./env"

export const mail = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE === "true",
  ...(env.SMTP_USER
    ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
    : {}),
  connectionTimeout: 10000,
  socketTimeout: 10000,
})
export async function sendMail(to: string, subject: string, text: string) {
  await mail.sendMail({ from: env.SMTP_FROM, to, subject, text })
}
