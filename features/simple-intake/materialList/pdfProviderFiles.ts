/**
 * Temporary OpenAI file upload/delete for PDF material-list extraction.
 */

import OpenAI from "openai";
import { toFile } from "openai";

export async function uploadPdfForMaterialExtraction(args: {
  client: OpenAI;
  bytes: Buffer;
  fileName: string;
}): Promise<{ fileId: string }> {
  const uploadable = await toFile(args.bytes, args.fileName, {
    type: "application/pdf",
  });
  const file = await args.client.files.create({
    file: uploadable,
    purpose: "user_data",
  });
  return { fileId: file.id };
}

export async function deleteProviderFileBestEffort(args: {
  client: OpenAI;
  fileId: string | null;
}): Promise<{ deleted: boolean; error: string | null }> {
  if (!args.fileId) return { deleted: false, error: null };
  try {
    await args.client.files.delete(args.fileId);
    return { deleted: true, error: null };
  } catch (err) {
    return {
      deleted: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
