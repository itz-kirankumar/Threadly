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
      console.log(`SES email sent to ${email}`);
    } catch (error) {
      console.error("Failed to send email via SES:", error);
    }
  } else {
    // Local fallback
    console.log("=== EMAIL INTERCEPTED (LOCAL FALLBACK) ===");
    console.log(`To: ${email}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: \n${bodyText}`);
    console.log("==========================================");
  }
}
