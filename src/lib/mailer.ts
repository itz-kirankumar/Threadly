import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const USE_AWS = process.env.USE_AWS === 'true';

let sesClient: SESClient | null = null;
if (USE_AWS) {
  sesClient = new SESClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });
}

export async function sendCommunityInvite(email: string) {
  const subject = "Welcome to the Wisentry B2C Founders Community! 🎉";
  const bodyText = `
Hi there!

Thank you for joining the Wisentry waitlist. As promised, here is your exclusive invite to our Discord community:
https://discord.gg/xTeuQ9yE4

Here is what you stand to gain by joining:
- FREE press opportunities and attention
- Free AI GTM service and leads generation
- Free Building Resources (including Free hosting and Free LLC incorporation for US startups)

See you inside!
The Wisentry Team
  `;

  if (USE_AWS && sesClient) {
    try {
      await sesClient.send(new SendEmailCommand({
        Source: process.env.FROM_EMAIL || "hello@wisentry.com",
        Destination: {
          ToAddresses: [email],
        },
        Message: {
          Subject: { Data: subject },
          Body: {
            Text: { Data: bodyText },
          }
        }
      }));
    } catch {
      throw new Error("Community email could not be sent. Please retry shortly.");
    }
  } else {
    // Do not write addresses or message content to local logs.
  }
}

export async function sendFounderOutreachEmail(input: { to: string; subject: string; body: string }) {
  if (!USE_AWS || !sesClient || !process.env.FROM_EMAIL) {
    throw new Error("Outbound email is not configured. Set USE_AWS=true and a verified FROM_EMAIL for Amazon SES.");
  }
  const result = await sesClient.send(new SendEmailCommand({
    Source: process.env.FROM_EMAIL,
    Destination: { ToAddresses: [input.to] },
    ReplyToAddresses: process.env.REPLY_TO_EMAIL ? [process.env.REPLY_TO_EMAIL] : undefined,
    Message: {
      Subject: { Data: input.subject, Charset: "UTF-8" },
      Body: { Text: { Data: input.body, Charset: "UTF-8" } },
    },
  }));
  if (!result.MessageId) throw new Error("Email provider did not confirm delivery.");
  return result.MessageId;
}
