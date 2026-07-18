import path from "path";
import fs from "fs";
import { ZipArchive } from "archiver";
import { PassThrough } from "stream";

export async function GET() {
  const sourceDir = path.join(process.cwd(), "backend", "extractors", "universal");

  if (!fs.existsSync(sourceDir)) {
    return Response.json({ error: "Extension source not found" }, { status: 404 });
  }

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);
  archive.directory(sourceDir, "brain-shadow-universal-extension");
  archive.finalize();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      passthrough.on("data", (chunk) => controller.enqueue(chunk));
      passthrough.on("end", () => controller.close());
      passthrough.on("error", (err) => controller.error(err));
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="brain-shadow-universal-extension.zip"',
    },
  });
}
