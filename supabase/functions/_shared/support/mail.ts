// Support email templates (plain text only). The access link goes in the email and nowhere else; nothing here logs it.
export interface SupportEmail {
  subject: string;
  text: string;
}
const SAFETY =
  'If a child is in danger, call your local emergency number. To report a message or a person in Athleit, use Report in the conversation.';

export function receivedEmail(a: {
  ref: string;
  url: string;
  contactEmail?: string | null;
}): SupportEmail {
  return {
    subject: `We got your request (${a.ref})`,
    text: [
      `Thanks for writing to Athleit. Your reference is ${a.ref}.`,
      '',
      'What happens next: a person reads every request and replies by email. We cannot promise a time.',
      '',
      `View your request or reply here: ${a.url}`,
      'Keep this link private. Anyone who has it can read and reply to this request.',
      '',
      SAFETY,
      ...(a.contactEmail ? ['', `Questions about this email: ${a.contactEmail}`] : []),
    ].join('\n'),
  };
}

export function replyEmail(a: { ref: string; body: string; url: string }): SupportEmail {
  return {
    subject: `New reply on ${a.ref}`,
    text: [
      `Athleit Support replied to ${a.ref}:`,
      '',
      a.body
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n'),
      '',
      `Read and reply: ${a.url}`,
      'Keep this link private. Attachments are only shown on the request page.',
      '',
      SAFETY,
    ].join('\n'),
  };
}
