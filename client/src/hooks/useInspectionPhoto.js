import { useEffect, useState } from "react";

export default function useInspectionPhoto(onError) {
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pick(file) {
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    onError("");
  }

  function clear() {
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(null);
    setPreview("");
  }

  return { photo, preview, pick, clear };
}
