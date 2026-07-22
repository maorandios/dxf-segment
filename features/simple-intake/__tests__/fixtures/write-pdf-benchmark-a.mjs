/**
 * Create a minimal born-digital PDF fixture for PDF intake smoke testing.
 * Run: node features/simple-intake/__tests__/fixtures/write-pdf-benchmark-a.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const content = `BT
/F1 12 Tf
50 740 Td (Material List - Quote PDF) Tj
0 -24 Td (Part Profile Material Thk Qty W L DXF) Tj
0 -20 Td (P1 PL25*495 S235 25 20 495 1200 part-a.dxf) Tj
0 -20 Td (P2 FLT12*100 S355 12 4 100 800) Tj
0 -20 Td (Subtotal 24) Tj
ET`;

const stream = Buffer.from(content, "utf8");
const objs = [
  "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
  "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
  "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n",
  `4 0 obj<< /Length ${stream.length} >>stream\n${content}\nendstream\nendobj\n`,
  "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
];

let body = "%PDF-1.4\n";
const offsets = [0];
for (const o of objs) {
  offsets.push(Buffer.byteLength(body, "utf8"));
  body += o;
}
const xrefStart = Buffer.byteLength(body, "utf8");
body += `xref\n0 ${objs.length + 1}\n`;
body += "0000000000 65535 f \n";
for (let i = 1; i <= objs.length; i++) {
  body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
}
body += `trailer<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

const file = path.join(__dirname, "pdf-benchmark-a-born-digital.pdf");
fs.writeFileSync(file, body);
console.log("wrote", file, fs.statSync(file).size);
