// Signed-copy PDF for a waiver acceptance. pdf-lib is injected so this module has no runtime dependency of its own
// (Deno imports npm:pdf-lib, tests import the Node package). The PDF carries: waiver title and version, the sha256
// content hash of the exact text signed, the full text, the typed signature, relationship, email, timestamp (UTC),
// consent to electronic records, and the registration / player it covers.

export interface PdfLib {
  PDFDocument: { create(): Promise<any> };
  StandardFonts: { Helvetica: string; HelveticaBold: string; Courier: string };
  rgb(r: number, g: number, b: number): unknown;
}

export interface WaiverCopyData {
  waiver: { title: string; version: number; body: string; content_hash: string };
  signer: { name: string; relationship: string; email: string };
  acceptedAt: string;
  electronicConsent: boolean;
  registrationDisplayId: string | null;
  playerName: string | null;
  subject: string | null;
}

/** Restricted markdown -> plain text lines (headings, bold/italic, lists, links, rules). Never HTML. */
export function markdownToPlain(md: string): string {
  return md
    .replace(/\r\n?/g, '\n')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, '')
    .trim();
}

/** Helvetica (WinAnsi) cannot draw most Unicode: map common punctuation, replace the rest with '?'. */
export function toWinAnsi(s: string): string {
  const map: Record<string, string> = {
    '‘': "'",
    '’': "'",
    '“': '"',
    '”': '"',
    '–': '-',
    '—': '-',
    '…': '...',
    '•': '•',
    ' ': ' ',
  };
  let out = '';
  for (const ch of s.normalize('NFC')) {
    const c = map[ch] ?? ch;
    const code = c.codePointAt(0)!;
    out +=
      (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || c === '•' || c === '\n'
        ? c
        : '?';
  }
  return out;
}

export async function buildWaiverPdf(lib: PdfLib, data: WaiverCopyData): Promise<Uint8Array> {
  const doc = await lib.PDFDocument.create();
  const font = await doc.embedFont(lib.StandardFonts.Helvetica);
  const bold = await doc.embedFont(lib.StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(lib.StandardFonts.Courier);
  const ink = lib.rgb(0.1, 0.11, 0.12);
  const muted = lib.rgb(0.35, 0.38, 0.4);
  const W = 612,
    H = 792,
    M = 54,
    LINE = 1.35;
  let page = doc.addPage([W, H]);
  let y = H - M;

  const ensure = (needed: number) => {
    if (y - needed < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const wrap = (text: string, f: any, size: number, width: number): string[] => {
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      if (!para.trim()) {
        lines.push('');
        continue;
      }
      let line = '';
      for (const word of para.split(/\s+/)) {
        // Break words that are wider than the line (long URLs, hashes).
        let w = word;
        while (f.widthOfTextAtSize(w, size) > width) {
          let i = w.length - 1;
          while (i > 1 && f.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
          if (line) {
            lines.push(line);
            line = '';
          }
          lines.push(w.slice(0, i));
          w = w.slice(i);
        }
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > width) {
          lines.push(line);
          line = w;
        } else line = test;
      }
      lines.push(line);
    }
    return lines;
  };
  const draw = (text: string, f: any, size: number, color: unknown = ink, gap = 0) => {
    for (const l of wrap(toWinAnsi(text), f, size, W - 2 * M)) {
      ensure(size * LINE);
      y -= size * LINE;
      if (l) page.drawText(l, { x: M, y, size, font: f, color });
    }
    y -= gap;
  };

  draw(data.waiver.title, bold, 16, ink, 4);
  draw(`Version ${data.waiver.version}`, font, 10, muted);
  draw(`Content hash (SHA-256): ${data.waiver.content_hash}`, mono, 7.5, muted, 12);
  draw(markdownToPlain(data.waiver.body), font, 10.5, ink, 16);

  ensure(150);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: muted });
  y -= 6;
  draw('Electronic signature record', bold, 11, ink, 2);
  draw(`Signed by: ${data.signer.name}`, font, 10.5);
  draw(`Relationship to the player: ${data.signer.relationship}`, font, 10.5);
  draw(`Email: ${data.signer.email}`, font, 10.5);
  draw(`Signed (UTC): ${data.acceptedAt}`, font, 10.5);
  if (data.playerName) draw(`Player: ${data.playerName}`, font, 10.5);
  if (data.subject) draw(`For: ${data.subject}`, font, 10.5);
  if (data.registrationDisplayId) draw(`Registration: ${data.registrationDisplayId}`, font, 10.5);
  draw(
    `Consent to use electronic records and signatures: ${data.electronicConsent ? 'Yes' : 'No'}`,
    font,
    10.5,
    ink,
    8,
  );
  draw(
    'Generated by Athleit from the stored acceptance record. The hash above identifies the exact text that was signed.',
    font,
    8,
    muted,
  );
  if (/[^\x00-\u00ff\u2022\u2018\u2019\u201c\u201d\u2013\u2014\u2026]/.test(data.waiver.body))
    draw(
      'Some characters could not be drawn in this PDF and appear as ?. The stored text and its hash are the authoritative record.',
      font,
      8,
      muted,
    );
  return await doc.save();
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
