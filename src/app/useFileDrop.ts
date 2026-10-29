import { useEffect, useState } from 'react';
import { MEDIA_MIME, PLUGIN_MIME, TEXT_PRESET_MIME } from '../ui/selection';

/** Arrastar arquivos do computador para qualquer lugar da janela. Diz se há arquivos sendo arrastados. */
export function useFileDrop(importFiles: (files: File[]) => void | Promise<void>) {
  const [draggingFiles, setDraggingFiles] = useState(false);
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDraggingFiles(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDraggingFiles(false);
    };
    const onDrop = (e: DragEvent) => {
      setDraggingFiles(false);
      const types = e.dataTransfer?.types ?? [];
      if (types.includes(PLUGIN_MIME) || types.includes(MEDIA_MIME) || types.includes(TEXT_PRESET_MIME)) return;
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) void importFiles(files);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [importFiles]);
  return draggingFiles;
}
