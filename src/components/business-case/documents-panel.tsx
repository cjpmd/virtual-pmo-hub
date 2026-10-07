// Documents panel (design §2.4, §3): upload (type and size checked first), list with
// versions, download by signed URL, archive; incomplete uploads offer Retry or Remove.
import { useRef, useState } from "react";
import { Archive, Download, FileText, RotateCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCaseAction, useCaseDocuments } from "@/hooks/use-business-case";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_TYPES,
  archiveCaseDocument,
  checkDocumentFile,
  documentUrl,
  removeIncompleteDocument,
  uploadCaseDocument,
  uploadFile,
  type CaseDocument,
  type CaseOwner,
} from "@/services/business-cases";

const ACCEPT = Object.keys(DOCUMENT_TYPES).join(",");

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function DocumentsPanel({
  owner,
  businessCaseId,
  canEdit,
  currentUserId,
}: {
  owner: CaseOwner;
  businessCaseId: string;
  canEdit: boolean;
  currentUserId: string | null;
}) {
  const format = useFormat();
  const documents = useCaseDocuments(businessCaseId);
  const input = useRef<HTMLInputElement>(null);
  const retryInput = useRef<HTMLInputElement>(null);
  const [retrying, setRetrying] = useState<CaseDocument | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const upload = useCaseAction(owner, (file: File) => uploadCaseDocument(businessCaseId, file), "Document uploaded");
  const retry = useCaseAction(
    owner,
    ({ doc, file }: { doc: CaseDocument; file: File }) => uploadFile(doc.storagePath, file),
    "Upload complete",
  );
  const archive = useCaseAction(owner, (id: string) => archiveCaseDocument(id), "Document archived");
  const remove = useCaseAction(owner, (id: string) => removeIncompleteDocument(id), "Upload removed");

  const pick = (file: File | undefined, onFile: (file: File) => void) => {
    if (!file) return;
    try {
      checkDocumentFile(file);
      onFile(file);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const open = async (doc: CaseDocument) => {
    try {
      window.open(await documentUrl(doc.storagePath), "_blank", "noopener");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const rows = (documents.data ?? []).filter((doc) => showArchived || !doc.archivedAt);
  const archivedCount = (documents.data ?? []).filter((doc) => doc.archivedAt).length;

  return (
    <section className="rounded-xl border border-pmo-line bg-pmo-panel font-geist">
      <header className="flex items-center justify-between gap-2 border-b border-pmo-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-pmo-text">Documents</h2>
          <p className="text-[11px] text-pmo-muted">PDF, Word, Excel or PowerPoint, up to 25 MB</p>
        </div>
        {canEdit && (
          <>
            <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => input.current?.click()}>
              <Upload />
              {upload.isPending ? "Uploading…" : "Upload"}
            </Button>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="hidden"
              aria-label="Upload a document"
              onChange={(event) => {
                pick(event.target.files?.[0], (file) => upload.mutate(file));
                event.target.value = "";
              }}
            />
          </>
        )}
        <input
          ref={retryInput}
          type="file"
          accept={ACCEPT}
          className="hidden"
          aria-label="Choose the file again"
          onChange={(event) => {
            const doc = retrying;
            pick(event.target.files?.[0], (file) => doc && retry.mutate({ doc, file }));
            event.target.value = "";
          }}
        />
      </header>

      <ul className="divide-y divide-pmo-line">
        {documents.isLoading && <li className="px-4 py-3 text-xs text-pmo-muted">Loading documents…</li>}
        {documents.isError && (
          <li className="px-4 py-3 text-xs text-pmo-bad-text">{(documents.error as Error).message}</li>
        )}
        {documents.isSuccess && !rows.length && (
          <li className="px-4 py-6 text-center text-xs text-pmo-muted">No documents yet.</li>
        )}
        {rows.map((doc) => (
          <li key={doc.id} className={cn("flex items-start gap-3 px-4 py-3", doc.archivedAt && "opacity-60")}>
            <FileText className="mt-0.5 size-4 shrink-0 text-pmo-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-pmo-text" title={doc.fileName}>
                {doc.fileName}
              </p>
              <p className="pmo-num text-[11px] text-pmo-muted">
                v{doc.version} · {DOCUMENT_TYPES[doc.mimeType] ?? "File"} · {sizeLabel(doc.sizeBytes)} ·{" "}
                {format.date(doc.createdAt)}
                {doc.uploadedBy ? ` · ${doc.uploadedBy}` : ""}
              </p>
              {doc.archivedAt && <p className="text-[11px] text-pmo-muted">Archived</p>}
              {!doc.uploaded && !doc.archivedAt && (
                <p className="text-[11px] font-medium text-pmo-warn">▲ Upload incomplete</p>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              {doc.uploaded ? (
                <Button size="icon" variant="ghost" className="size-7" aria-label={`Download ${doc.fileName}`} onClick={() => void open(doc)}>
                  <Download />
                </Button>
              ) : (
                doc.uploadedById === currentUserId &&
                !doc.archivedAt && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`Retry upload of ${doc.fileName}`}
                      onClick={() => {
                        setRetrying(doc);
                        retryInput.current?.click();
                      }}
                    >
                      <RotateCw />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`Remove ${doc.fileName}`}
                      onClick={() => remove.mutate(doc.id)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )
              )}
              {canEdit && doc.uploaded && !doc.archivedAt && (
                <Button size="icon" variant="ghost" className="size-7" aria-label={`Archive ${doc.fileName}`} onClick={() => archive.mutate(doc.id)}>
                  <Archive />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {archivedCount > 0 && (
        <button
          type="button"
          className="w-full border-t border-pmo-line px-4 py-2 text-left text-[11px] text-pmo-muted hover:text-pmo-text"
          onClick={() => setShowArchived((value) => !value)}
        >
          {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
        </button>
      )}
    </section>
  );
}
